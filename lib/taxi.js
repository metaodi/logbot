'use strict';

var Log = require('./log');

module.exports = class Taxi extends Log {
    constructor() {
        super();
        this.type = 'taxi';
    }
};
