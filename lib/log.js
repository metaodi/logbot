'use strict';

var Moment = require('moment-timezone');
var _ = require('lodash');

module.exports = class Log {
    constructor() {
        this.type = 'log';
        this.commands = {
            '': {
                'fn': this.help,
            },
            'help': {
                'fn': this.help,
            },
            'list': {
                'fn': this.list,
            },
            'pop': {
                'fn': this.pop,
            },
            'clear': {
                'fn': this.clear,
            },
        };
    }

    runCommand(command, db, slashCommand, message) {
        if (command in this.commands) {
            var config = this.commands[command];
            var bindFn = _.bind(config.fn, this);
            bindFn(db, slashCommand, message);
            return true;
        } 
        return false;
    }

    help(db, slashCommand, message) {
        slashCommand.replyPrivate(message,
            "I save messages, you can list messages using `/" + this.type + " list`.\n" +
            "Type `/" + this.type + " pop` to remove and retrieve the last message, `/" + this.type + " clear` clears all messages.\n" +
            "Try typing `/" + this.type + " <my entry>` to add a new entry to the list.");
    }

    list(db, slashCommand, message) {
        db.logs.find({$query: {'user': message.user, 'type': this.type}, $orderby: {'_id': 1}}, function (err, docs) {
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

    pop(db, slashCommand, message) {
        db.logs.find({'user': message.user, 'type': this.type}).sort({"_id": -1}).limit(1, function(err, docs) {
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

    clear(db, slashCommand, message) {
        var docs = db.logs.find({$query: {'user': message.user, 'type': this.type}, $orderby: {_id: -1}}, function(err, docs) {
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

    insert(db, slashCommand, message) {
        var doc = {
            user: message.user,
            type: this.type,
            log_date: new Date(),
            message: message.text
        };

        db.logs.insert(doc, function(err) {
            if (err) {
                slashCommand.replyPrivate(message, "An error ocurred when saving your message: " + err);
            } else {
                slashCommand.replyPrivate(message, "Your message was successfully saved: " + doc.message);
            }
        });
    }
};
