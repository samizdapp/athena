# Athena CLI

A bespoke terminal interface wrapped around a Yargs app.

The Athena CLI `tools-cli` provides a set of utility commands that aid
development and testing.

## Running Locally

To run the Athena CLI locally, execute `npm start tools-cli`. Once it has
finished starting up, a command prompt will appear in which you can run
commands:

```
** Athena CLI: **
>
```

Run `help` to see the list of available commands:

```
>  help

 [command]

Commands:
  ping-address <multiaddr>         Ping a multiaddr
  dial-box <multiaddr> [protocol]  Dial a box

Options:
  --version  Show version number                                       [boolean]
  --help     Show help                                                 [boolean]
```
