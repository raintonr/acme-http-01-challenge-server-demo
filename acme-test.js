'use strict';

const options = require('./options.json');

const http01Challenge = require('./http-01-challenge-server').create();
http01Challenge.init(options);

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

    var challenges = {
        'http-01': http01Challenge
    };

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

    // Terminate our server
    http01Challenge.shutdown();
}

main().catch(function (e) {
    console.error(e.stack);
    http01Challenge.shutdown();
});
