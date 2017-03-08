var Botkit = require('botkit');
var BotkitStorage = require('botkit-storage-mongo');
var Moment = require('moment-timezone');
var Slack = require('slack-api');
var mongojs = require('mongojs');
var _ = require('lodash');

if (!process.env.CLIENT_ID || !process.env.CLIENT_SECRET || !process.env.PORT || !process.env.VERIFICATION_TOKEN) {
    console.log('Error: Specify CLIENT_ID, CLIENT_SECRET, VERIFICATION_TOKEN and PORT in environment');
    process.exit(1);
}

var config = {};
if (process.env.MONGODB_URI) {
    config = {
        storage: BotkitStorage({mongoUri: process.env.MONGODB_URI}),
    };
} else {
    config = {
        json_file_store: './logbot_storage/',
    };
}
 
// db for logs
var dbUrl = process.env.MONGODB_URI || 'mongodb://localhost/logbot',
    coll = [ 'logs' ],
    db = mongojs(dbUrl, coll);

db.on('error', function(err) {
    console.log('database error', err);
});
console.log('db connected', dbUrl);

var controller = Botkit.slackbot(config).configureSlackApp(
    {
        clientId: process.env.CLIENT_ID,
        clientSecret: process.env.CLIENT_SECRET,
        scopes: ['commands'],
    }
);

controller.setupWebserver(process.env.PORT, function (err, webserver) {
    controller.createWebhookEndpoints(controller.webserver);

    controller.createOauthEndpoints(controller.webserver, function (err, req, res) {
        if (err) {
            res.status(500).send('ERROR: ' + err);
        } else {
            res.send('Success!');
        }
    });

    // add API to get logs of user
    webserver.post('/logs', function (req, res) {
        Slack.auth.test({'token': req.body.token},
            function(err, authData) {
                if (err) {
                    res.status(500).json({"ok": false, "result": [], "error": 'ERROR: ' + err});
                    return;
                }

                var query = getQuery(authData, req);
                db.logs.find({$query: query}, function (err, docs) {
                    if (err) {
                        res.status(500).json({"ok": false, "result": [], "error": 'ERROR: ' + err});
                        return;
                    }
                    res.json({"ok": true, "result": docs});
                });
        });
    });
});

function getQuery(authData, req) {
    var type = req.query.type || 'taxi';
    var startDate = req.query.startDate;
    var endDate = req.query.endDate;

    var query = {'user': authData.user_id, 'type': type};
    if (startDate || endDate) {
        query.log_date = {};

        startDate = Moment(startDate);
        if (startDate.isValid()) {
            startDate = startDate.startOf('day').tz('Europe/Zurich');
            query.log_date.$gte = startDate.toDate();
        }

        endDate = Moment(endDate);
        if (endDate.isValid()) {
            endDate = endDate.endOf('day').tz('Europe/Zurich');
            query.log_date.$lte = endDate.toDate();
        }
    }

    return query;
}


controller.on('slash_command', function (slashCommand, message) {
    // first, let's make sure the token matches!
    if (message.token !== process.env.VERIFICATION_TOKEN) {
        return; //just ignore it.
    }
    var commands = {
        '': {
            'fn': log_help,
        },
        'help': {
            'fn': log_help,
        },
        'list': {
            'fn': log_list,
        },
        'pop': {
            'fn': log_pop,
        },
        'clear': {
            'fn': log_clear,
        },
    };
    var type;
    switch (message.command) {
        case "/log": //handle the `/log` slash command. 
            type = 'log';
            break;
        case "/taxi": //handle the `/taxi` slash command. 
            type = 'taxi';
            break;
        default:
            slashCommand.replyPublic(message, "I'm afraid I don't know how to " + message.command + " yet.");
            return;
    }
    var cmd = commands[message.text];
    if (cmd) {
        cmd.fn(slashCommand, message, type);
        return;
    }

    log_insert(slashCommand, message);
});

function log_help(slashCommand, message, type) {
    slashCommand.replyPrivate(message,
        "I save messages, you can list messages using `/" + type + " list`.\n" +
        "Type `/" + type + " pop` to remove and retrieve the last message, `/" + type + " clear` clears all messages.\n" +
        "Try typing `/" + type + " entry` to add a new entry to the list.");
}

function log_list(slashCommand, message, type) {
    db.logs.find({$query: {'user': message.user, 'type': type}, $orderby: {'_id': 1}}, function (err, docs) {
        if (err) {
            slashCommand.replyPrivate(message, "An error ocurred while retrieving your messages: " + err);
            return;
        }
        if (docs.length === 0) {
            slashCommand.replyPrivate(message, "No message found.");
            return;
        }

        slashCommand.replyPrivateDelayed(message, "All logged messages:", function() {
            var returnMsg = '';
            _.each(docs, function(doc) {
                var logDate = Moment(doc.log_date).tz('Europe/Zurich');
                returnMsg += " - " + logDate.format('DD.MM.YYYY HH:mm') + ": " + doc.message + "\n";
            });
            slashCommand.replyPrivate(message, returnMsg);
        });
    });
}

function log_pop(slashCommand, message, type) {
    db.logs.find({'user': message.user, 'type': type}).sort({"_id": -1}).limit(1, function(err, docs) {
        if (docs.length === 0) {
            slashCommand.replyPrivate(message, "No message found.");
            return;
        }
        var latest = docs[0];
        var poppedMsg = latest.message;

        db.logs.remove({_id: {$eq: latest._id}}, function(err) {
            if (err) {
                slashCommand.replyPrivate(message, "An error ocurred while removing latest message: " + err);
                return;
            }
        });
        slashCommand.replyPrivate(message, "Message popped: " + poppedMsg);
    });
}

function log_clear(slashCommand, message, type) {
    var docs = db.logs.find({$query: {'user': message.user, 'type': type}, $orderby: {_id: -1}}, function(err, docs) {
        if (err) {
            slashCommand.replyPrivate(message, "An error ocurred while querying your messages: " + err);
        }
        var ids = _.map(docs, function(doc) { return doc._id; });
        db.logs.remove({_id: {$in: ids}}, function(err) {
            if (err) {
                slashCommand.replyPrivate(message, "An error ocurred while removing messages: " + err);
                return;
            }
            slashCommand.replyPrivate(message, "All messages cleared");
        });
    });
}

function log_insert(slashCommand, message) {
    var doc = {
        user: message.user,
        type: 'log',
        log_date: new Date(),
        message: message.text
    };

    if (message.text.startsWith("taxi")) {
        doc.type = 'taxi';
        doc.message = doc.message.substring(("taxi".length)+1);
    }

    db.logs.insert(doc, function(err) {
        if (err) {
            slashCommand.replyPrivate(message, "An error ocurred when saving your message: " + err);
        } else {
            slashCommand.replyPrivate(message, "Your message was successfully saved: " + doc.message);
        }
    });
}
