# adonis-run

Run a script with your AdonisJS application booted, like `rails runner`.

```sh
node ace run scripts/release.ts
```

Read more here: [Adding rails runner to AdonisJS](https://rohitpaulk.com/articles/adding-rails-runner-to-adonisjs).

## Install

```sh
npm install @antislop/adonis-run
node ace configure @antislop/adonis-run
```

The configure command registers the package's `run` command in `adonisrc.ts`. Alternatively, register it manually by adding this entry to your existing `commands` array:

```ts
commands: [
  () => import('@adonisjs/core/commands'),
  () => import('@antislop/adonis-run/commands'),
],
```

## Usage

Invoke a script of your choice like this:

```sh
node ace run scripts/release.ts
```

### Arguments and flags

Extra arguments are passed through the script and available in `process.argv.slice(2)`:

```sh
node ace run scripts/greet.ts Alice "Hello there"
```

```ts
// scripts/greet.ts
const [name, greeting] = process.argv.slice(2);
console.log(`${greeting}, ${name}!`);
```

Use `--` before script flags so Ace does not interpret them:

```sh
node ace run scripts/release.ts production -- --dry-run --limit=10
```

The script receives `['production', '--dry-run', '--limit=10']`. The first `--` is a separator and is not forwarded. Arguments after it are preserved, including flag values, leading zeros, and additional `--` tokens.

`process.argv[0]` remains the Node.js executable, and `process.argv[1]` is the resolved script path.

## License

MIT
