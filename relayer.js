#!/usr/bin/env node

const Web3 = require('web3');
const request = require('request');
const fs = require('fs');
const util = require('util');
/* 
 *  Usage:  Subscribe to Geth node and push header to syscoin via RPC 
 *
 */

/* Set up logging */
var logFile = fs.createWriteStream('relayer-debug.log', { flags: 'a' });
var logStdout = process.stdout;

console.log = function () {
    var date = new Date().toISOString();
    logFile.write(date + ' '  + util.format.apply(null, arguments) + '\n');
    logStdout.write(date + ' ' + util.format.apply(null, arguments) + '\n');
}
console.error = console.log;


/* Retrieve arguments */
let argv = require('yargs')
	.usage('Usage: $0 -sysrpcuser [username] -sysrpcpw [password] -sysrpcport [port] -ethwsport [port]')
	.default("sysrpcport", 8370)
	.default("ethwsport", 8546)
	.default("sysrpcuser", "u")
	.default("sysrpcpw", "p")
	.argv
;
if (argv.sysrpcport < 0 || argv.sysrpcport > 65535) {
	console.log('Invalid Syscoin RPC port');
	exit();
}
if (argv.ethwsport < 0 || argv.ethwsport > 65535) {
	console.log('Invalid Geth RPC port');
	exit();
}
const sysrpcport = argv.sysrpcport;
const ethwsport = argv.ethwsport;
const sysrpcuser = argv.sysrpcuser;
const sysrpcpw = argv.sysrpcpw;

/* Initialize Geth Web3 */
var infura_ws_url = "wss://rinkeby.infura.io/ws/v3/d178aecf49154b12be98e68e998cfb8d";
var geth_ws_url = "ws://127.0.0.1:" + ethwsport;
var web3 = new Web3(geth_ws_url);
var web3_infura = new Web3(infura_ws_url);
var subscriptionSync = null;
var subscriptionHeader = null;

/* Global Arrays */
var collection = [];
var missingBlocks = {};
var requestedBlocks = {};

/* Global Variables */
var highestBlock = 0;
var currentBlock = 0; 
var timediff = 0;
var downloadingBlocks = false;
var timeSinceLastHeaders = new Date() / 1000;
var timeSinceInfura = 0;
var isListenerInfura = false;
var currentWeb3 = null;
var localProviderTimeOut = 300;
var maxMissingBlocksPerCycle = 400;
var timeOutProvider = null;

SetupListener(web3, false);

function SetupListener(web3In, infura) {
	var provider = null;
	if (infura == true) {
		provider = new Web3.providers.WebsocketProvider(infura_ws_url);
	} else {
		provider = new Web3.providers.WebsocketProvider(geth_ws_url);
	}

	provider.on("error", err => {
		console.log("SetupListener: web3 socket error\n")
	});

	provider.on("end", err => {
		// Attempt to try to reconnect every 3 seconds
		console.log("SetupListener: web3 socket ended.  Retrying...\n");
		timeOutProvider = setTimeout(function () {
			SetupListener(web3In, infura);
		}, 3000);
	});

	provider.on("connect", function () {
		console.log("SetupListener: web3 connected: ", infura ? "Infura" : "Local Geth");
		SetupSubscriber();
	});
	cancelSubscriptions();
	currentWeb3 = web3In;
	isListenerInfura = infura;
	if (timeOutProvider != null) {
		clearTimeout(timeOutProvider);
		timeOutProvider = null;
	}
	if (isListenerInfura) {
		console.log("SetupListener: Currently using Infura");
		timeSinceInfura = new Date() / 1000;
	} else {
		console.log("SetupListener: Currently using local geth");
	}
	web3In.setProvider(provider);
}

/* Timer for submitting header lists to Syscoin via RPC */
const timer = setInterval(RPCsyscoinsetethheaders, 5000);
function RPCsyscoinsetethheaders() {
	var nowTime = new Date() / 1000;
	if (isListenerInfura == false && timeSinceLastHeaders > 0 && (nowTime - timeSinceLastHeaders) > localProviderTimeOut) {
        console.log("RPCsyscoinsetethheaders: Geth has not received headers for " + (nowTime - timeSinceLastHeaders) + "s.  Switching to use Infura");
		SetupListener(web3_infura, true);
		if (timeOutProvider != null) {
			clearTimeout(timeOutProvider);
			timeOutProvider = null;
		}
	} else if (isListenerInfura == true && timeSinceInfura > 0 && (nowTime - timeSinceInfura) > (localProviderTimeOut * 2)) {
        console.log("RPCsyscoinsetethheaders: Infura has been running for over " + (nowTime - timeSinceInfura) + "s.  Switching back to local Geth");
		SetupListener(web3, false);
		if (timeOutProvider != null) {
			clearTimeout(timeOutProvider);
			timeOutProvider = null;
		}
	}


	// Check if there's anything in the collection
	if (collection.length == 0) {
		// console.log("collection is empty");
		return;
	}

	if (highestBlock != 0 && currentBlock >= highestBlock && timediff < 600) {
		console.log("RPCsyscoinsetethheaders: Geth should be synced based on current block height and timestamp");
		RPCsyscoinsetethstatus(["synced", currentBlock]);
		timediff = 0;
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
			console.error('RPCsyscoinsetethheaders: An error has occurred during request: ', error);
		} 
	});

    console.log("RPCsyscoinsetethheaders: Successfully pushed " + collection.length + " headers to Syscoin Core");
	collection = [];
};

const timer2 = setInterval(retrieveBlock, 3000);
function retrieveBlock() {
	var complete = true;
	var fetch_counter = 0;

	for (var key in missingBlocks) {
		var value = missingBlocks[key];
		if (value == true) {
			complete = false;
			fetch_counter++;
		}

		if (fetch_counter > maxMissingBlocksPerCycle) {
			return;
		}


		if (requestedBlocks.hasOwnProperty(key) && requestedBlocks[key] == true) {
			return;
		}

		requestedBlocks[key] = true;
		if (value) {
			try {
				currentWeb3.eth.getBlock(key, function(error, result) {
					if (error) {
						web3_infura.eth.getBlock(key, function(error, result){
							if (error) {
								requestedBlocks[key] = false;
								console.log("RetrieveBlock: getBlock: Infura error: ", error);
							}
							else if (result != "undefined") {
								missingBlocks[key] = false;
								let obj = [result['number'],result['transactionsRoot'],result['receiptsRoot']];
								collection.push(obj);
							}
						});
					}
					else if (result != "undefined") {
						missingBlocks[key] = false;
						let obj = [result['number'],result['transactionsRoot'],result['receiptsRoot']];
						collection.push(obj);
					}
				});
			} catch (e) {
				requestedBlocks[key] = false;
				console.log("RetrieveBlock: getBlock caught error", e, key, missingBlocks[key], value, requestedBlocks[key]);
			}

		}
	}


	if (complete == true) {
		if (Object.keys(missingBlocks).length > 0) {
			console.log("RetrieveBlock: Clearing missingBlocks");
		}
		missingBlocks = {};
		requestedBlocks = {};
	}
};

function RPCsyscoinsetethstatus(params) {
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
		body: JSON.stringify( {
			"jsonrpc": "1.0", 
			"id": "eth_sync_update", 
			"method": "syscoinsetethstatus",
			"params": params})
	};

	console.log("RPCsyscoinsetethstatus: Posting sync status: ", params);
	request(options, (error, response, body) => {
		if (error) {
			console.error('RPCsyscoinsetethstatus: An error has occurred during request: ', error);
		} else {
			console.log('RPCsyscoinsetethstatus: Post successful; received missing blocks reply: ', body);
			var parsedBody = JSON.parse(body);
            if (parsedBody != null) {
		    	var missingBlockRanges = parsedBody.result.missing_blocks;
			    var counter = 0;

                // TODO: 
         	  	missingBlocks = {};

                /* Check for missing blocks and add the blocks to array */
			    if (missingBlockRanges.length == 0) {
			    	console.log("RPCsyscoinsetethstatus: There is no missing blocks");
			    } else {
			    	for(var i = 0; i < missingBlockRanges.length; i++) {
			     		for(var i2 = missingBlockRanges[i].from; i2 <= missingBlockRanges[i].to; i2++) {
				    		missingBlocks[i2] = true;
					    	counter++;
				    	}
				    }
			    }
			    console.log("RPCsyscoinsetethstatus: missingBlocks count: ", counter, Object.keys(missingBlocks).length);
            }
		}
	});
};

function SetupSubscriber() {
	/* Subscription for Geth incoming new block headers */
	cancelSubscriptions();

	console.log("SetupSubscriber: Subscribing to newBlockHeaders");
	subscriptionHeader = currentWeb3.eth.subscribe('newBlockHeaders', (error, blockHeader) => {
		if (error) return console.error("SetupSubscriber:" + error);
		if (blockHeader['number'] > currentBlock) {
			currentBlock = blockHeader['number'];
		}
		if (currentBlock > highestBlock) {
			highestBlock = currentBlock;
		}
		let obj = [blockHeader['number'],blockHeader['transactionsRoot'],blockHeader['receiptsRoot']];
		collection.push(obj);

		// Check blockheight and timestamp to notify synced status
		timediff = new Date() / 1000 - blockHeader['timestamp'];
		timeSinceLastHeaders = new Date() / 1000;
	});


	/*  Subscription for Geth syncing status */
	console.log("SetupSubscriber: Subscribing to syncing");
	subscriptionSync = currentWeb3.eth.subscribe('syncing', function(error, sync){
		if (error) return console.error("SetupSubscriber:" + error);

		var params = [];
		if (typeof(sync) == "boolean") {
			if (sync) {
				params = ["syncing", 0];
			} else  {
				// Syncing === false doesn't meant that it's done syncing.
				// It simply means it's not syncing
				if (currentBlock < highestBlock || highestBlock == 0) {
					// highestBlock == 0 should really mean it's waiting to connect to peer
					params = ["syncing", highestBlock];
				} else {
					console.log("subscriptionSync: Geth is synced based on syncing subscription");
					params = ["synced", highestBlock];
				}
			}
		} else {
			if (highestBlock < sync.status.HighestBlock) {
				highestBlock = sync.status.HighestBlock;
			}
			params = ["syncing", highestBlock];
		}
		RPCsyscoinsetethstatus(params);
	});
};

function cancelSubscriptions () {
	if (subscriptionHeader != null) {
		subscriptionHeader.unsubscribe(function(error, success){
			if(success)
				console.log('Successfully unsubscribed from newBlockHeaders!');
		});
	}
	if (subscriptionSync != null) {
		subscriptionSync.unsubscribe(function(error, success){
			if(success)
				console.log('Successfully unsubscribed from sync!');
		});
	}
	subscriptionHeader = null;
	subscriptionSync = null;
}
