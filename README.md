# project-repl
Adds a REPL to the codebase of a project that will require all the project's depdendencies and all its source files and store them in global variables you can access from the REPL.

## Usage:

### To add to a project:
```shell
yarn add --dev project-repl
npx make-repl
```

### To run the repl:
```shell
./repl
```

Or if you didn't want to do `npx make-repl`, you can just do
```shell
npx repl
```

The repl will startup and require all your dependencies and
.js files and tell you how long they took to require.

You'll see a Node shell that looks something like this:

```text
ccheever@Charlies-MacBook-Pro:~/projects/ghost-server$./repl
> // ghost-server v1.0.0 // node v10.9.0
6 npm modules and 6 files required in 185ms
express(124ms) pg(39ms) body-parser(6ms) node-fetch(6ms) @expo/time thin-server
Api db index secret users/AuthApi users/ExpoApiV2Client
>
```

The times in parentheses are how long it took to require each module and file that takes longer than 4ms (configurable) to `require`.

If you have a `main` specified in your `package.json`, the exports of that will be assigned to the global namespace as well, and listed in the output at the top of the REPL.

## Configuration

The easiest way to configure the project REPL is to add a `repl` section to your `package.json`. 

#### Ignoring modules or files

You can ignore modules and files by adding to the `modules` and `files` keys under repl.ignore.

```json

  ...
  "repl": {
    "ignore": {
      "modules": [
        "nodemon", "ignoreme"
      ],
      "files": [
        "BigAndUnimportantFile.js"
      ]
    }
  ...

```

#### devDependencies

`devDependencies` are not included by default, but can be by adding the key `devDependencies` under `repl`.

```json
  "repl": {
    "devDependencies": true
  }
```

#### Other Options

Use `populateGlobalWithMain` to control whether the exports of `main` are added to the global object. The default is `true`.

```json
  "repl": {
    "populateGlobalWithMain": false,
  }
```

`threshold`, `filesThreshold`, and `modulesThreshold` can be used to control the minimum number of ms before the REPL will print out how many ms it took to load that file or module. The default is 4ms.

If you want no threshold, use -1 instead of 0. 0 will be interpreted as falsy and the default will be used.

```json
  "repl": {
    "threshold": -1,
  }
```

