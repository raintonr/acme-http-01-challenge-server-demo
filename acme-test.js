// Based https://www.npmjs.com/package/acme (examples/get-certificate-full.js)

'use strict';

const options = require('./options.json');

// Create/init challenge plugins

const challenges = [];
const toShutdown = [];
for (const [type, details] of Object.entries(options.challenges)) {
    if (details.active) {
        console.log('Init challenge ' + type);
        const thisChallenge = require(details.module).create(details.createOptions);
        challenges[type] = thisChallenge;
        if (details.addProperties) {
            for (const [key, value] of Object.entries(details.addProperties)) {
                console.log(`Adding ${key} = ${value}`);
                thisChallenge[key] = value;
            }
        }
        if (thisChallenge.shutdown) {
            console.log('This will need shutdown later');
            toShutdown.push(thisChallenge);
        }
    }
}

// Terminate challenges
// 'shutdown' is non-standard but added for our http-01-challenge-server
function shutdownChallenges() {
    console.log('Shutdown...');
    for (const challenge of toShutdown) {
        challenge.shutdown();
    }
}

async function main() {
    var pkg = require('./package.json');
    var packageAgent = 'test-' + pkg.name + '/' + pkg.version;

    // Choose either the production or staging URL

    var directoryUrl = 'https://acme-staging-v02.api.letsencrypt.org/directory';
    //var directoryUrl = 'https://acme-v02.api.letsencrypt.org/directory'

    // This is intended to get at important messages without
    // having to use even lower-level APIs in the code

    function notify(ev, msg) {
        console.log(ev, JSON.stringify(msg));
    }

    var Keypairs = require('@root/keypairs');

    const ACME = require('acme');
    var acme = ACME.create({ maintainerEmail: options.email, packageAgent, notify, debug: true });
    await acme.init(directoryUrl);

    // You only need ONE account key, ever, in most cases
    // save this and keep it safe. ECDSA is preferred.

    var accountKeypair = await Keypairs.generate({ kty: 'EC', format: 'jwk' });
    var accountKey = accountKeypair.private;

    // This can be `true` or an async function which presents the terms of use

    var agreeToTerms = true;

    console.info('registering new ACME account...');
    var account = await acme.accounts.create({
        subsciberEmail: options.email,
        agreeToTerms,
        accountKey
    });
    console.info('created account with id', account.key.kid);

    // This is the key used by your WEBSERVER, typically named `privkey.pem`,
    // `key.crt`, or `bundle.pem`. RSA may be preferrable for legacy compatibility.

    // You can generate it fresh
    var serverKeypair = await Keypairs.generate({ kty: 'RSA', format: 'jwk' });
    var serverKey = serverKeypair.private;
    var serverPem = await Keypairs.export({ jwk: serverKey });
    var serverKey = await Keypairs.import({ pem: serverPem });

    var CSR = require('@root/csr');
    var PEM = require('@root/pem');

    var encoding = 'der';
    var typ = 'CERTIFICATE REQUEST';

    var csrDer = await CSR.csr({ jwk: serverKey, domains: options.domains, encoding });
    var csr = PEM.packBlock({ type: typ, bytes: csrDer });

    console.info('validating domain authorization for ' + options.domains.join(' '));
    var pems = await acme.certificates.create({
        account,
        accountKey,
        csr,
        domains: options.domains,
        challenges
    });
    // const  fullchain = pems.cert + '\n' + pems.chain + '\n';

    console.log('Done.');
    console.log(serverPem);
    console.log(pems.cert);

    shutdownChallenges();
}

main().catch(function (e) {
    console.error('Failed!');
    console.error(e.stack);
    shutdownChallenges();
});
