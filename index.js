let fs = require('fs');
let path = require('path');

let recursiveReaddirAsync = require('recursive-readdir');

/**
 * Promise interface for `fs.readFile`
 *
 * @param {<string> | <Buffer> | <URL> | <integer>} p filename or file descriptor
 * @param {<Object> | <string>} options
 */
async function readFileAsync(...args) {
  return new Promise((resolve, reject) => {
    fs.readFile(...args, (err, result) => {
      if (err) {
        reject(err);
      } else {
        resolve(result);
      }
    });
  });
}

/**
 * Reads the contents of a JSON file at a path and returns a JS object
 *
 * @param {<string>} p path to JSON file
 *
 */
async function readJsonFileAsync(p) {
  return JSON.parse(await readFileAsync(p, 'utf8'));
}

/**
 * Class for requiring everything in a project
 *
 * @param {string} dir The directory of the project
 * @param {function} require_ A function that requires a string from the root directory of the project
 * @param {Object} [opts] Additional options
 *
 * Options are:
 *    ignore - Object with files and modules lists keys
 *    ignoreFiles - List of files and directories to ignore (matches the basename)
 *    ignoreModules - List of npm modules to ignore and not require
 *    devDependencies - Boolean; if true, devDependencies will be required. Defaults to false
 *    into - Object to require everything into; Defaults to `global`
 *    populateGlobalWithMain - If true, will take the objects exported by the main file and put them into `into`
 *    modulesThreshold - Threshold in ms for when to show times for module requires, default 4
 *    filesThreshold - Threshold in ms for when to show times for file requires, default 4
 *    threshold - Default value for module and files thresholds
 *
 */
class Requirer {
  constructor(dir, require_, opts) {
    this._dir = dir || '.';
    this._constructorOpts = opts || {};
    this._require = require_;
  }

  async _getConfigAsync() {
    await this._getPackageJsonAsync();
    this._opts = Object.assign(
      {
        populateGlobalWithMain: true,
      },
      this._pkg.repl,
      this._constructorOpts
    );
    this._ignore = this._getIgnores();
  }

  async _getPackageJsonAsync() {
    // Read package.json if it exists
    let pkgPath = path.join(this._dir, 'package.json');
    try {
      this._pkg = await readJsonFileAsync(pkgPath);
    } catch (e) {
      // TODO: Distinguish between parse error and missing package.json
      this._pkg = {};
    }
  }

  _varNameForModule(m) {
    let v = '';
    let capNext = false;
    for (let c of m) {
      switch (c) {
        case '-':
          capNext = true;
          break;
        case '.':
          break;
        case '/':
          v = '';
          capNext = false;
          break;
        default:
          if (capNext) {
            v += c.toUpperCase();
          } else {
            v += c;
          }
          capNext = false;
          break;
      }
    }
    return v;
  }

  _varNameForFile(p) {
    let pNoSuffix = p.substr(0, p.length - '.js'.length);
    let pp = pNoSuffix.split(/\/+/);
    let ppName = pp.map((x) => {
      return this._varNameForModule(x);
    });
    return ppName.join('_');
  }

  _getIgnores() {
    let ignoreFiles = {
      __tests__: true,
    };
    let ignoreModules = {
      'project-repl': true,
    };

    let pkg = this._pkg;
    let bfiles = (pkg.repl && pkg.repl.ignore && pkg.repl.ignore.files) || [];
    for (let bf of bfiles) {
      ignoreFiles[bf] = true;
    }

    let bmodules = (pkg.repl && pkg.repl.ignore && pkg.repl.ignore.modules) || [];
    for (let bm of bmodules) {
      ignoreModules[bm] = true;
    }

    let ret = {
      files: Object.assign({}, ignoreFiles, this._opts.ignoreFiles),
      modules: Object.assign({}, ignoreModules, this._opts.ignoreModules),
      globs: (pkg.repl && pkg.repl.ignore && pkg.repl.ignore.globs) || [],
    };

    return ret;
  }

  _getModules() {
    // Make sure you call _getConfigAsync before calling this
    // so that this._ignore is populated

    let pkg = this._pkg;

    let depsMap = { ...pkg.dependencies };
    let devDepsMap = {};
    if (this._opts.devDependencies) {
      devDepsMap = { ...pkg.devDependencies };
    }

    for (let x in this._ignore.modules) {
      if (this._ignore.modules[x]) {
        delete depsMap[x];
        delete devDepsMap[x];
      }
    }

    let deps = Object.keys(depsMap);
    let devDeps = Object.keys(devDepsMap);

    // Load deps before devDeps since that's what will happen in production and we
    // don't want devDeps masking the time cost of deps by loading some of their
    // dependencies in advance (though this can happen with other deps too...)
    let allDeps = [].concat(deps, devDeps);

    return allDeps;
  }

  async _getFilesAsync() {
    let files = await recursiveReaddirAsync(this._dir, [
      ...this._ignore.globs,
      (file, stats) => {
        let basename = path.basename(file);
        if (stats.isDirectory()) {
          switch (basename) {
            case 'node_modules':
            case '.git':
              return true;
            default:
              return this._ignore.files[basename];
          }
        } else {
          if (basename.endsWith('.js')) {
            if (basename.endsWith('.test.js')) {
              return true;
            }
            if (this._ignore.files[basename] || this._ignore.files[file]) {
              return true;
            }
            return false;
          }
          return true;
        }
      },
    ]);

    return files;
  }

  /**
   * Requires all modules and files and returns information about
   * what was required and how long it took
   *
   */
  async requireAsync() {
    await this._getConfigAsync();
    let modules = this._getModules();
    let files = await this._getFilesAsync();

    let times = { modules: {}, files: {} };

    let g = this._opts.into || global;

    let modulesStartTime = Date.now();
    for (let m of modules) {
      let name = this._varNameForModule(m);
      let startTime = Date.now();
      g[name] = this._require(m);
      let endTime = Date.now();
      let t = endTime - startTime;
      times.modules[m] = t;
    }
    times.modulesTotal = Date.now() - modulesStartTime;

    let filesStartTime = Date.now();
    let mainExports = [];
    let main = undefined;
    for (let f of files) {
      let name = this._varNameForFile(f);
      let fNoSuffix = f.substr(0, f.length - '.js'.length);
      let fWithPrefix = './' + fNoSuffix;
      let startTime = Date.now();
      g[name] = this._require(fWithPrefix);
      let endTime = Date.now();

      // If this is the main file
      if (this._pkg.main === f) {
        // Alias this to the name of the module for clarity and convenience
        main = this._varNameForModule(this._pkg.name);
        g[main] = g[name];

        // Populate the global object with the exports of main
        if (this._opts.populateGlobalWithMain) {
          Object.assign(g, g[name]);
          mainExports = Object.keys(g[name]);
        }
      }

      let t = endTime - startTime;
      times.files[fNoSuffix] = t;
    }
    times.filesTotal = Date.now() - filesStartTime;

    return {
      modules,
      files,
      times,
      mainExports,
      main,
    };
  }

  _dispForTimes(times, threshold) {
    let sortable = [];
    for (let x in times) {
      sortable.push([x, times[x]]);
    }
    sortable.sort((a, b) => {
      return b[1] - a[1];
    });
    let disp = [];
    for (let [name, t] of sortable) {
      if (t >= threshold) {
        disp.push(name + '(' + t + 'ms)');
      } else {
        disp.push(name);
      }
    }
    return disp.join(' ');
  }

  /**
   * Requires all files and logs the results in a sensible way
   */
  async requireAndLogAsync() {
    let results = await this.requireAsync();
    let { modules, files } = results.times;

    let projectVersion = this._pkg.version || '';
    let projectName = this._pkg.name || path.basename(path.resolve(this._dir));
    let nodeVersion = process.version;
    console.log('// ' + projectName + ' v' + projectVersion + ' // node ' + nodeVersion);

    console.log(
      Object.keys(modules).length +
        ' npm modules and ' +
        Object.keys(files).length +
        ' files required in ' +
        (results.times.modulesTotal + results.times.filesTotal) +
        'ms'
    );

    if (Object.keys(modules).length > 0) {
      console.log(
        this._dispForTimes(modules, this._opts.modulesThreshold || this._opts.threshold || 4)
      );
    }
    if (Object.keys(files).length > 0) {
      console.log(
        this._dispForTimes(files, this._opts.filesThreshold || this._opts.threshold || 4)
      );
    }
    if (results.mainExports.length > 0) {
      console.log(results.mainExports.join(' '));
    }
    if (results.main) {
      console.log(results.main);
    }

    // If we have a custom startup message, then display it
    if (this._opts.startupMessage) {
      console.log(this._opts.startupMessage);
    }

    process.stdout.write('> ');

    return results;
  }
}

module.exports = (dir, require_, opts) => {
  let r = new Requirer(dir, require_, opts);
  r.requireAndLogAsync();
};

let repl = `#!/usr/bin/env sh
node --experimental-repl-await -i -e "require('project-repl')('.', (x) => require(x));" $*
`;
let majorVersion = parseInt(process.version.split('.')[0].substr(1));
if (majorVersion < 10) {
  repl = `#!/usr/bin/env sh
node -i -e "require('project-repl')('.', (x) => require(x));" $*
`;
}

Object.assign(module.exports, {
  Requirer,
  repl,
  makeRepl: (file) => {
    file = file || 'repl';
    fs.writeFileSync(file, repl, 'utf8');
    fs.chmodSync(file, '755');
  },
});

if (require.main === module) {
  module.exports();
}
