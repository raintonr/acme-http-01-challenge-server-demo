'use strict';

const options = require('./options.json');

const http01Challenge = require('./http-01-challenge-server').create();
http01Challenge.init(options);

async function main() {
    require('dotenv').config();

    const fs = require('fs');
    // just to trigger the warning message out of the way
    await fs.promises.readFile().catch(function () { });
    console.warn('\n');

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
    var acme = ACME.create({ maintainerEmail: options.maintainerEmail, packageAgent, notify, debug: true });
    await acme.init(directoryUrl);

    // You only need ONE account key, ever, in most cases
    // save this and keep it safe. ECDSA is preferred.

    var accountKeypair = await Keypairs.generate({ kty: 'EC', format: 'jwk' });
    var accountKey = accountKeypair.private;

    // This can be `true` or an async function which presents the terms of use

    var agreeToTerms = true;

    // If you are multi-tenanted or white-labled and need to present the terms of
    // use to the Subscriber running the service, you can do so with a function.
    var agreeToTerms = async function () {
        return true;
    };

    console.info('registering new ACME account...');
    var account = await acme.accounts.create({
        subsciberEmail: options.subscriberEmail,
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
    await fs.promises.writeFile('./privkey.pem', serverPem, 'ascii');

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
    var fullchain = pems.cert + '\n' + pems.chain + '\n';

    console.log('Done. Private Key:');
    console.log(serverPem);
    console.log('Cert:');
    console.log(pems.cert);

    // Terminate our server
    http01Challenge.shutdown();
}

main().catch(function (e) {
    console.error(e.stack);
    http01Challenge.shutdown();
});