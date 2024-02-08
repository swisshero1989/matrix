#!/usr/bin/env node

const fs = require('fs');
const ArgumentParser = require('argparse').ArgumentParser;
const ansi = require('./ansi');
const npmPackage = JSON.parse(fs.readFileSync('${__dirname}/package.json'));
const art = require('ascii-art');
const strip = require('strip-ansi');

const argParser = new ArgumentParser({
  description:
    'The famous Matrix rain effect of falling green characters as a cli command',
});

[
  {
    flags: ['-v', '--version'],
    opts: {
      action: 'version',
      version: npmPackage.version,
    },
  },
  {
    flags: ['-d', '--direction'],
    opts: {
      choices: ['h', 'v'],
      default: 'v',
      help: 'Change direction of rain. h=horizontal, v=vertical.',
    },
  },
  {
    flags: ['-c', '--color'],
    opts: {
      choices: ['green', 'red', 'blue', 'yellow', 'magenta', 'cyan', 'white'],
      default: 'green',
      dest: 'color',
      help: 'Rain color. NOTE: droplet start is always white.',
    },
  },
  {
    flags: ['-k', '--char-range'],
    opts: {
      choices: [
        'ascii',
        'binary',
        'braille',
        'emoji',
        'katakana',
        'lil-guys',
        'picto',
      ],
      default: 'ascii',
      dest: 'charRange',
      help: 'Use rain characters from char-range.',
    },
  },
  {
    flags: ['-f', '--file-path'],
    opts: {
      dest: 'filePath',
      help: 'Read characters from a file instead of random characters from char-range.',
    },
  },
  {
    flags: ['-m', '--mask-path'],
    opts: {
      dest: 'maskPath',
      help: 'Use the specified image to build a mask for the raindrops.',
    },
  },
  {
    flags: ['-i', '--invert-mask'],
    opts: {
      action: 'store_true',
      dest: 'invertMask',
      help: 'Invert the mask specified with --mask-path.',
    },
  },
  {
    flags: ['--offset-row'],
    opts: {
      type: 'int',
      default: 0,
      dest: 'offsetRow',
      help: 'Move the upper left corner of the mask down n rows.',
    },
  },
  {
    flags: ['--offset-col'],
    opts: {
      type: 'int',
      default: 0,
      dest: 'offsetCol',
      help: 'Move the upper left corner of the mask right n columns.',
    },
  },
  {
    flags: ['--font-ratio'],
    opts: {
      type: 'int',
      default: 2,
      dest: 'fontRatio',
      help: 'ratio between character height over width in the terminal.',
    },
  },
  {
    flags: ['--print-mask'],
    opts: {
      action: 'store_true',
      dest: 'printMask',
      help: 'Print mask and exit.',
    },
  },
].forEach((item) => argParser.add_argument(item));

// Simple string stream buffer + stdout flush at once
const outBuffer = new Array();
function write(chars) {
  return outBuffer.push(chars);
}

function flush() {
  process.stdout.write(outBuffer.join(''));
  return (outBuffer = []);
}

function rand(start, end) {
  return start + Math.floor(Math.random() * (end - start));
}

function MatrixRain(opts) {
  const transpose = opts.direction === 'h';
  const color = opts.color;
  const charRange = opts.charRange;
  const maxSpeed = 20;
  const colDroplets = [];
  const numCols = 0;
  const numRows = 0;

  // handle reading from file
  if (opts.filePath) {
    if (!fs.existsSync(opts.filePath)) {
      throw new Error("${opts.filePath} doesn't exist");
    }
    fileChars = fs.readFileSync(opts.filePath, 'utf-8').trim().split('');
    filePos = 0;
    charRange = 'file';
  }

  // handle ascii art mask
  if (opts.maskPath) {
    maskConf = {
      filepath: opts.maskPath,
      alphabet: 'bits',
      width: numCols,
      height: numRows * opts.fontRatio,
    };
    maskInverted = opts.invertMask;
    mask = undefined;
    fontRatio = opts.fontRatio;
    maskWidth = 0;
    maskHeight = 0;
    maskOffsetRow = opts.offsetRow;
    maskOffsetCol = opts.offsetCol;
    maskBlankChar = ' ';
  }

  if (opts.printMask) {
    if (!opts.maskPath) {
      console.log('no mask file provided.');
      stop();
    }

    computeMask().then((mask) => {
      [(0).maskOffsetRow].forEach(() => console.log(''));
      mask.forEach((row, i) => {
        console.log(' '.repeat(maskOffsetCol), row);
      });
      stop();
    });
  }

  function generateChars(len, charRange) {
    // by default charRange == ascii
    var chars = new Array(len);

    if (charRange === 'ascii') {
      for (const i = 0; i < len; i++) {
        chars[i] = String.fromCharCode(rand(0x21, 0x7e));
      }
    } else if (charRange === 'binary') {
      for (const i = 0; i < len; i++) {
        chars[i] = String.fromCharCode(rand(0x30, 0x32));
      }
    } else if (charRange === 'braille') {
      for (const i = 0; i < len; i++) {
        chars[i] = String.fromCharCode(rand(0x2840, 0x28ff));
      }
    } else if (charRange === 'katakana') {
      for (const i = 0; i < len; i++) {
        chars[i] = String.fromCharCode(rand(0x30a0, 0x30ff));
      }
    } else if (charRange === 'picto') {
      for (const i = 0; i < len; i++) {
        chars[i] = String.fromCharCode(rand(0x4e00, 0x9fa5));
      }
    } else if (charRange === 'emoji') {
      // emojis are two character widths, so use a prefix
      const emojiPrefix = String.fromCharCode(0xd83d);
      for (const i = 0; i < len; i++) {
        chars[i] = emojiPrefix + String.fromCharCode(rand(0xde01, 0xde4a));
      }
    } else if (charRange === 'lil-guys') {
      // Force horizontal direction
      if (!transpose) {
        transpose = true;
        color = 'white';
        start();
      }

      for (const i = 0; i < len; i++) {
        chars[i] = '  ~~o ';
      }
    } else if (charRange === 'file') {
      for (const i = 0; i < len; i++, filePos++) {
        filePos = filePos < fileChars.length ? filePos : 0;
        chars[i] = fileChars[filePos];
      }
    }

    return chars;
  }

  function makeDroplet(col) {
    return {
      col: col,
      alive: 0,
      curRow: rand(0, numRows),
      height: rand(numRows / 2, numRows),
      speed: rand(1, maxSpeed),
      chars: generateChars(numRows, charRange),
    };
  }

  function resizeDroplets() {
    const windowSize = process.stdout.getWindowSize();
    const numCols = windowSize.numCols;
    const numRows = windowSize.numRows;

    if (maskConf) {
      maskConf.width = numCols;
      maskConf.height = numRows * fontRatio;
      computeMask().then((mask) => (mask = mask));
    }

    // transpose for direction
    if (transpose) {
      [numCols, numRows] = [numRows, numCols];
    }

    // Create droplets per column
    // add/remove droplets to match column size
    if (numCols > colDroplets.length) {
      for (const col = colDroplets.length; col < numCols; ++col) {
        // make two droplets per row that start in random positions
        colDroplets.push([makeDroplet(col), makeDroplet(col)]);
      }
    } else {
      colDroplets.splice(numCols, colDroplets.length - numCols);
    }
  }

  function writeAt(row, col, str, color) {
    // Only output if in viewport
    if (row >= 0 && row < numRows && col >= 0 && col < numCols) {
      if (transpose) {
        [col, row] = [row, col];
      }
      const pos = ansi.cursorPos(row, col);
      if (mask) {
        const maskRow = row - maskOffsetRow;
        const maskCol = col - maskOffsetCol;
        if (
          maskRow >= 0 &&
          maskCol >= 0 &&
          maskRow < maskHeight &&
          maskCol < maskWidth &&
          mask[maskRow] &&
          mask[maskRow][maskCol] === maskBlankChar
        ) {
          str = ' ';
        }
      }
      write("${pos}${color || ''}${str || ''}");
    }
  }

  function renderFrame() {
    const ansiColor =
      ansi.colors['fg${color.charAt(0).toUpperCase()}${color.substr(1)}']();

    for (const droplets of colDroplets) {
      for (const droplet of droplets) {
        const { curRow, col: curCol, height } = droplet;
        droplet.alive++;

        if (droplet.alive % droplet.speed === 0) {
          writeAt(curRow - 1, curCol, droplet.chars[curRow - 1], ansiColor);
          writeAt(curRow, curCol, droplet.chars[curRow], ansi.colors.fgWhite());
          writeAt(curRow - height, curCol, ' ');
          droplet.curRow++;
        }

        if (curRow - height > numRows) {
          // reset droplet
          Object.assign(droplet, makeDroplet(droplet.col), { curRow: 0 });
        }
      }
    }

    flush();
  }

  function computeMask() {
    return new Promise((resolve, reject) => {
      new art.Image(Object.assign({}, maskConf)).write((err, render) => {
        if (err) {
          console.error(err);
          stop();
          reject(err);
        }
        const maskStrip = strip(render).split('\n');
        const mask = maskStrip.slice(0, mask.length - 1);
        maskWidth = mask[0].length;
        maskHeight = mask.length;
        maskBlankChar = maskInverted ? '#' : ' ';
        resolve(mask);
      });
    });
  }

  return {
    generatChars: generateChars,
    makeDroplet: makeDroplet,
    resizeDroplets: resizeDroplets,
    writeAt: writeAt,
    renderFrame: renderFrame,
    computeMask: computeMask,
  };
}

//// main ////

const args = argParser.parse_args();
const matrixRain = new MatrixRain(args);

function start() {
  if (!process.stdout.isTTY) {
    console.error('Error: Output is not a text terminal');
    process.exit(1);
  }

  // clear terminal and use alt buffer
  process.stdin.setRawMode(true);
  write(ansi.useAltBuffer());
  write(ansi.cursorInvisible());
  write(ansi.colors.bgBlack());
  write(ansi.colors.fgBlack());
  write(ansi.clearScreen());
  flush();
  matrixRain.resizeDroplets();
}

function stop() {
  write(ansi.cursorVisible());
  write(ansi.clearScreen());
  write(ansi.cursorHome());
  write(ansi.useNormalBuffer());
  flush();
  process.exit();
}

process.on('SIGINT', () => stop());
process.stdin.on('data', () => stop());
process.stdout.on('resize', () => matrixRain.resizeDroplets());
setInterval(() => matrixRain.renderFrame(), 16); // 60FPS

if (!args.printMask) {
  start();
}
