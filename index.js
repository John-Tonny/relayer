#!/usr/bin/env node

const axios = require('axios');
const Web3 = require('web3');
const request = require('request');

/* 
 *  Usage:  Subscribe to Geth node and push header to syscoin via RPC 
 *
 */

let argv = require('yargs')
     .usage('Usage: $0 -sysrpcuser [username] -sysrpcpw [password] -sysrpcport [port] -ethrpcport [port]')
     .default("sysrpcport", 18369)
     .default("ethrpcport", 8546)
     .default("sysrpcuser", "u")
     .default("sysrpcpw", "p")
     .argv
;
if (argv.sysrpcport < 0 || argv.sysrpcport > 65535) {
    console.log('Invalid Syscoin RPC port');
    exit();
}
if (argv.ethrpcport < 0 || argv.ethrpcport > 65535) {
		console.log('Invalid Geth RPC port');
		exit();
}
const sysrpcport = argv.sysrpcport;
const ethrpcport = argv.ethrpcport;
const sysrpcuser = argv.sysrpcuser;
const sysrpcpw = argv.sysrpcpw;
/* This is an attempt to use syscoin-js 
var customHttpAgent = "";
let syscoinClient = new SyscoinRpcClient({baseUrl : "localhost",
                port : argv.syscoinrpcport,
                username : "u",
                password : "p",
                useSsl : false,
                timeout : 30000,
                customHttpAgent,
                loggerLevel : "", 
                whitelist : [], 
                blacklist : []});
let info = syscoinClient.networkServices.getInfo();
info.then((response) => response.json()).then((json) => {
  console.info('got a response', json);
});
*/

/* Initialize Geth Web3 */
let web3 = new Web3("ws://127.0.0.1:" + argv.ethrpcport);
var collection = [];

/* Geth subscriber for new block headers */
const subscription_header = web3.eth.subscribe('newBlockHeaders', (error, blockHeader) => {
    if (error) return console.error(error);
    console.log(blockHeader);
    let obj = [blockHeader['number'],blockHeader['transactionsRoot']];
    collection.push(obj);
});

/* Timer for submitting header lists to Syscoin via RPC */
const timer = setInterval(pushToRPC, 50000);
function pushToRPC() {
	// Check if there's anything in the collection
	if (collection.length == 0) {
			console.log("collection is empty");
			return;
	}
	
	// Request options
	let options = {
        url: "http://localhost:" + sysrpcport,
        method: "post",
        headers:
        {
            "content-type": "text/plain"
        },
        auth: {
            user: sysrpcuser,
            pass: sysrpcpw 
        },
        body: JSON.stringify( {"jsonrpc": "1.0", "id": "ethheader_update", "method": "syscoinsetethheaders", "params": [collection]})
    };

    request(options, (error, response, body) => {
        if (error) {
            console.error('An error has occurred: ', error);
        } else {
            console.log('Post successful: response: ', body);
        }
    });

	console.log("pushing to rpc", JSON.stringify(collection));
};

// unsubscribes the header subscription
subscription_header.unsubscribe((error, success) => {
    if (error) return console.error(error);

    console.log('Successfully unsubscribed!');
	clearInterval(timer);
});

/*  Subscription for Geth syncing status */
const subscription_sync = web3.eth.subscribe('syncing', function(error, sync){
	console.log("subscription_sync: callback");
    if (!error)
        console.log(sync);
})
.on("data", function(sync){
    // show some syncing stats
    console.log("subscription_sync: on data");
})
.on("changed", function(isSyncing){
   if(isSyncing) {
   console.log("subscription_sync: is_syncing = true");
        // stop app operation
    } else {
    console.log("subscription_sync: is_syncing = false");
        // regain app operation
    }
	let options = {
        url: "http://localhost:" + sysrpcport,
        method: "post",
        headers:
        {
            "content-type": "text/plain"
        },
        auth: {
            user: sysrpcuser,
            pass: sysrpcpw 
        },
        body: JSON.stringify( {"jsonrpc": "1.0", "id": "sync_update", "method": "syscoinsetethstatus", "params": [isSyncing]})
    };
    console.log(options.body);

    request(options, (error, response, body) => {
        if (error) {
            console.error('An error has occurred: ', error);
        } else {
            console.log('Post successful: response: ', body);
        }
    });
});

// unsubscribes the subscription
subscription_sync.unsubscribe(function(error, success){
    if(success)
        console.log('Successfully unsubscribed!');
});

