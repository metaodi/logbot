var Botkit = require('botkit');
var BotkitStorage = require('botkit-storage-mongo');
var Moment = require('moment-timezone');
var Slack = require('slack-api');
var mongojs = require('mongojs');
var _ = require('lodash');

var Log = require('./lib/log');
var Taxi = require('./lib/taxi');

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
                var limit = parseInt(req.query.limit);
                if (_.isNaN(limit)) {
                    limit = 1000;
                }
                db.logs.find({$query: query}).limit(limit, function (err, docs) {
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
    var command;
    switch (message.command) {
        case "/log": //handle the `/log` slash command. 
            command = new Log();
            break;
        case "/taxi": //handle the `/taxi` slash command. 
            command = new Taxi();
            break;
        default:
            slashCommand.replyPublic(message, "I'm afraid I don't know how to " + message.command + " yet.");
            return;
    }
    var result = command.runCommand(message.text, db, slashCommand, message);
    if (result) {
        return;
    }

    command.insert(db, slashCommand, message);
});
