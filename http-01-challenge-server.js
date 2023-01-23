// Based on https://www.npmjs.com/package/acme-http-01-standalone

'use strict';

const http = require('http');

// Yes, yes, no-one likes globals :P
const _memdb = {};
let _challengeServer = null;
let _config = null;

function _getChallengeKey(data) {
    return data.challenge.token;
    var ch = data.challenge;
    return ch.identifier.value + '#' + ch.token;
}

function _createChallengeServer() {
    _challengeServer = http.createServer();
    _challengeServer.on('request', (req, res) => {
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
        if (_challengeServer != null) {
            console.warn('Server already running!');
            resolve(null);
        } else {
            _createChallengeServer();
            _challengeServer.listen(_config.port, _config.address, (err) => {
                if (err) {
                    console.error(err);
                    reject(err);
                } else {
                    console.log(`challengeServer listening on ${_config.address}/${_config.port}`);
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
    if (!_challengeServer) {
        console.warn('Shutdown called but nothing to do');
    } else {
        console.log('Shutting down challengeServer');
        _challengeServer.close();
        // Technically one should free up _memdb here too
    }
}

module.exports.create = function (config) {
    _config = config;
    return {
        init: _init,
        set: _set,
        get: _get,
        remove: _remove,
        shutdown: _shutdown
    };
};
