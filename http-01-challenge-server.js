// Based on https://www.npmjs.com/package/acme-http-01-standalone

'use strict';

const http = require('http');

// Yes, yes, no-one likes globals :P
const _memdb = {};
let challengeServer = null;

function _getChallengeKey(data) {
    return data.challenge.token;
    var ch = data.challenge;
    return ch.identifier.value + '#' + ch.token;
}

function _createChallengeServer() {
    challengeServer = http.createServer();
    challengeServer.on('request', (req, res) => {
        let response = '';
        console.log('challengeServer request: ' + req.url);
        const regexp = /^\/.well-known\/acme-challenge\/(.*)/;
        const matches = req.url.match(regexp);
        if (matches === null || !Array.isArray(matches) || matches.length != 2) {
            console.warn("Request doesn't look like ACME challenge");
        } else {
            const token = matches[1];
            console.log('Got challenge for ' + token);
            const tokenChallenge = _memdb[token];
            if (!tokenChallenge) {
                console.warn('token not in DB: ' + token);
            } else {
                response = tokenChallenge.keyAuthorization;
            }
        }
        res.end(response);
    });
}

const _init = (opts) => {
    console.log('init: ' + JSON.stringify(opts));
    return new Promise((resolve, reject) => {
        if (!opts.challengeServerAddress || !opts.challengeServerPort) {
            console.log('No challngeServer address/port - ignoring');
            resolve(null);
        } else {
            _createChallengeServer();
            challengeServer.listen(opts.challengeServerPort, opts.challengeServerAddress, (err) => {
                if (err) {
                    console.error(err);
                    reject(err);
                } else {
                    console.log('challengeServer listening on ' + opts.challengeServerPort);
                    resolve(null);
                }
            });
        }
    });
}

const _set = (data) => {
    console.log('_set:' + JSON.stringify(data));
    // Should setup challenge server:
    // body: challenge.keyAuthorization
    return Promise.resolve().then(function () {
        const key = _getChallengeKey(data)
        _memdb[key] = data.challenge;
        console.log(`Added ${key} - DB now contains: ${Object.keys(_memdb).length}`);
        return null;
    });
}

const _get = (data) => {
    console.log('get:' + JSON.stringify(data));
    return Promise.resolve().then(function () {
        const key = _getChallengeKey(data);
        if (_memdb[key]) {
            return { keyAuthorization: _memdb[key] };
        }
        return null;
    });
}

const _remove = (data) => {
    console.log('remove:' + JSON.stringify(data));
    return Promise.resolve().then(function () {
        delete _memdb[_getChallengeKey(data)];
        console.log('DB now contains: ' + Object.keys(_memdb).length);
        return null;
    });
}

const _shutdown = () => {
    if (!challengeServer) {
        console.warn('Shutdown called but nothing to do');
    } else {
        console.log('Shutting down challengeServer');
        challengeServer.close();
        // Technically one should free up _memdb here too
    }
}

module.exports.create = function (config) {
    return {
        init: _init,
        set: _set,
        get: _get,
        remove: _remove,
        shutdown: _shutdown
    };
};
