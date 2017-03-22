'use strict';

var Log = require('./log').Log;

class Taxi extends Log {
    constructor() {
        super();
        this.type = 'taxi';
    }
}

exports.Taxi = Taxi; 
