[![Build Status](https://travis-ci.org/metaodi/logbot.svg?branch=master)](https://travis-ci.org/metaodi/logbot)

Logbot
=======

![Logbot Logo](https://github.com/metaodi/logbot/raw/master/log_logo_small.png "Logbot Logo")

Logbot is a slackbot to log/stash whatever is on your mind while using slack.
It let's you later retrieve this messages, along with the time when you saves them.

One specific use case is to quickly note down activities you do to make it easier to fill in your timesheets later on.
This is where the intergration with [cabdriver](https://github.com/metaodi/cabdriver) comes in handy.

## Usage

Logbot add the `/log` command to Slack, you can use it in the following way:


1. Save a message: `/log my message`
1. Retrieve a list of all saved messages: `/log list`
1. Return the last message and remove it from the list: `/log pop`
1. Clear the content of the list: `/log clear`

By default all messages are saved with the type `log`, if you want to use Logbot to save messages for taxi (via cabdriver), you can save messages like that:

1. Save a taxi message: `/log taxi _internal 1 Meeting with George`
1. Retrieve a list of all taxi entries: `/log list taxi` 

## Development

To run the bot locally and expose it to the internet, use `localtunnel`:

```
lt --port 8765 --subdomain logbotcmd
```


## Credits

Logo: [LOG File by Hea Poh Lin](https://thenounproject.com/term/log-file/896964/) from the Noun Project (CC-BY)
