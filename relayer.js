#!/usr/bin/env node

const Web3 = require('web3');
const request = require('request');
const fs = require('fs');
const util = require('util');
const Getter = require('./getter.js');
/* 
 *  Usage:  Subscribe to Geth node and push header to syscoin via RPC 
 *
 */
/* Retrieve arguments */
let argv = require('yargs')
	.usage('Usage: $0 -sysrpcuser [username] -datadir [syscoin data dir] -sysrpcpw [password] -sysrpcport [port] -ethwsport [port] -infurakey [apikey]')
	.default("sysrpcport", 8370)
	.default("ethwsport", 8546)
	.default("sysrpcuser", "u")
	.default("sysrpcpw", "p")
	.default("datadir", "~/.syscoin")
	.default("infurakey", "b3d07005e22f4127ba935ce09b9a2a8d")
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
const datadir = argv.datadir;
const infuraapikey = argv.infurakey;

/* Set up logging */
var logFile = fs.createWriteStream(datadir + '/syscoin-relayer.log', { flags: 'a' });
var logStdout = process.stdout;

console.log = function () {
    var date = new Date().toISOString();
    logFile.write(date + ' '  + util.format.apply(null, arguments) + '\n');
    logStdout.write(date + ' ' + util.format.apply(null, arguments) + '\n');
}
console.error = console.log;

console.log("Running V1.0.0 version of the Syscoin relay logger! This tool pushed headers from Ethereum to Syscoin for consensus verification of SPV proofs of Syscoin Mint transactions.");

/* Initialize Geth Web3 */
var infura_ws_url = "wss://rinkeby.infura.io/ws/v3/" + infuraapikey;
var geth_ws_url = "ws://127.0.0.1:" + ethwsport;
var web3 = new Web3(geth_ws_url);
var web3_infura = new Web3(infura_ws_url);
var subscriptionSync = null;
var subscriptionHeader = null;

/* Global Arrays */
var collection = [];
var missingBlocks = [];
var fetchingBlocks = [];

/* Global Variables */
var highestBlock = 0;
var currentBlock = 0; 
var timediff = 0;
var timeSinceLastHeaders = new Date() / 1000;
var timeSinceInfura = 0;
var isListenerInfura = false;
var currentWeb3 = null;
var localProviderTimeOut = 300;
var timeOutProvider = null;
var missingBlockChunkSize = 100;
var missingBlockTimer = null;

var getter = new Getter(web3);
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
		console.log("SetupListener: web3 connected");
		SetupSubscriber();
	});
	cancelSubscriptions();
	currentWeb3 = web3In;
	// change web3 provider on Getter so if it is stuck getting range of blocks it can switch to try to get out and also
	// for subsequent gets it should use this new web3 provider
	getter.setWeb3(currentWeb3);
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
setInterval(RPCsyscoinsetethheaders, 5000);
function RPCsyscoinsetethheaders() {
	var nowTime = new Date() / 1000;
	var timeOutToSwitchToInfura = localProviderTimeOut;
	// if we are missing blocks we should set this timeout to something small as we need those blocks ASAP
	var remainingBlocks = getter.remainingBlockCount;
	if (remainingBlocks > 0) {
		console.log("RPCsyscoinsetethheadaers: Getter remaining blocks: " + remainingBlocks);
	}

	if(missingBlocks.length > 0){
		timeOutToSwitchToInfura = 65; // 65 seconds to switch
	}

	if (isListenerInfura == false && timeSinceLastHeaders > 0 && (nowTime - timeSinceLastHeaders) > timeOutToSwitchToInfura) {
        console.log("RPCsyscoinsetethheaders: Geth has not received headers for " + (nowTime - timeSinceLastHeaders) + "s.  Switching to use Infura");
		timeSinceLastHeaders = new Date() / 1000;
		SetupListener(web3_infura, true);
		if (timeOutProvider != null) {
			clearTimeout(timeOutProvider);
			timeOutProvider = null;
		}
		// if Getter is stuck on await allow to startup another timer to request again
		if(missingBlockTimer != null){
			clearTimeout(missingBlockTimer);
			setTimeout(retrieveBlock, 3000);
		}
		// clear fetching blocks so it will reset and allow to fetch it again
		fetchingBlocks = [];
	} else if (isListenerInfura == true && timeSinceInfura > 0 && (nowTime - timeSinceInfura) > (localProviderTimeOut * 2)) {
        console.log("RPCsyscoinsetethheaders: Infura has been running for over " + (nowTime - timeSinceInfura) + "s.  Switching back to local Geth");
		timeSinceLastHeaders = new Date() / 1000;
		SetupListener(web3, false);
		if (timeOutProvider != null) {
			clearTimeout(timeOutProvider);
			timeOutProvider = null;
		}
		// if Getter is stuck on await allow to startup another timer to request again
		if(missingBlockTimer != null){
			clearTimeout(missingBlockTimer);
			setTimeout(retrieveBlock, 3000);
		}	
		// clear fetching blocks so it will reset and allow to fetch it again
		fetchingBlocks = [];
	}


	// Check if there's anything in the collection
	if (collection.length == 0) {
		// console.log("collection is empty");
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
			console.error('RPCsyscoinsetethheaders: An error has occurred during request: ', error);
		} 
	});
	timeSinceLastHeaders = new Date() / 1000;
    console.log("RPCsyscoinsetethheaders: Successfully pushed " + collection.length + " headers to Syscoin Core");
	collection = [];

	if (highestBlock != 0 && currentBlock >= highestBlock && timediff < 600) {
		console.log("RPCsyscoinsetethheaders: Geth should be synced based on current block height and timestamp");
		RPCsyscoinsetethstatus(["synced", currentBlock]);
		timediff = 0;
	}
};

missingBlockTimer = setTimeout(retrieveBlock, 3000);
async function retrieveBlock() {
    try {
	    if(missingBlocks.length > 0){
    		var lastItem = Object.assign({}, missingBlocks.pop());
    		fetchingBlocks.push(lastItem);
    		console.log("retrieveBlock: Fetching range " + JSON.stringify(lastItem));
    		let fetchedBlocks = await getter.getAll(lastItem.from, lastItem.to);
    		fetchingBlocks.pop();
    		if(!fetchedBlocks || fetchedBlocks.length <= 0){
    			missingBlocks.push(lastItem);
    			console.log("retrieveBlock: Could not fetch range " + JSON.stringify(lastItem) + " pushing back to missingBlocks...");
    		}
    		else{
    			console.log("retrieveBlock: Fetched range " + JSON.stringify(lastItem));
    		}
    		for (var key in fetchedBlocks) {
    			var result = fetchedBlocks[key];
    			var obj = [result.number,result.hash,result.parentHash,result.transactionsRoot,result.receiptsRoot];
    			collection.push(obj);
    		}

    		missingBlockTimer = setTimeout(retrieveBlock, 300);
    	}
        else {	
    		missingBlockTimer = setTimeout(retrieveBlock, 3000);
        }
    } catch (e) {
		missingBlockTimer = setTimeout(retrieveBlock, 3000);
    }
};

function UpdateMissingBlocksBasedOnFetchingBlocks(rawMissingBlocks){
	var prevCount = rawMissingBlocks.length;
	var removingIndexes = [];
	for(var i =0;i<rawMissingBlocks.length;i++){
		for(var j = 0;j<fetchingBlocks.length;j++){
			if(rawMissingBlocks[i].from == fetchingBlocks[j].from && rawMissingBlocks[i].to == fetchingBlocks[j].to){
				removingIndexes.push(i);
			}
		}
	}
	for(var i =0;i<removingIndexes.length;i++){
		rawMissingBlocks.splice(removingIndexes[i], 1);
	}
	var postCount = rawMissingBlocks.length;
	if(removingIndexes.length > 0){
		console.log("UpdateMissingBlocksBasedOnFetchingBlocks: Removing missing block " + removingIndexes.length + " indexes because they are currently being fetched, had " + prevCount + " missing ranges and now have " + postCount + " missing ranges.");
	}
}
function breakdownMissingBlocks(rawMissingBlocks) {
	var tempBlocks = [];
	for(var i=0; i<rawMissingBlocks.length; i++) {
		var from = rawMissingBlocks[i].from;
	 	var to = rawMissingBlocks[i].to;		
		var blockDiff = to - from;
		if(blockDiff > missingBlockChunkSize) {
			var modulus = blockDiff % missingBlockChunkSize;
			var set = Math.floor(blockDiff/missingBlockChunkSize);
			for (var j=0; j < set; j++) {
				var obj = {"from": from + j*missingBlockChunkSize, "to": from + (j+1)*missingBlockChunkSize - 1};
				tempBlocks.push(obj);
			}	
			
			var lastFrom = from + set * missingBlockChunkSize;
			var lastTo = lastFrom + modulus;
			tempBlocks.push({"from": lastFrom, "to": lastTo});
			rawMissingBlocks.splice(i,1);
		}
	}
	for(var i = tempBlocks.length - 1; i >= 0;  i--) {
		rawMissingBlocks.unshift(tempBlocks[i]);
	}
}
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
				var rawMissingBlocks = parsedBody.result.missing_blocks;
				UpdateMissingBlocksBasedOnFetchingBlocks(rawMissingBlocks);
				breakdownMissingBlocks(rawMissingBlocks);
				missingBlocks = rawMissingBlocks;
			    if (missingBlocks.length > 0) {
					console.log("RPCsyscoinsetethstatus: missingBlocks count: " + missingBlocks.length);
				}
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
		let obj = [blockHeader['number'],blockHeader['hash'],blockHeader['parentHash'],blockHeader['transactionsRoot'],blockHeader['receiptsRoot']];
		collection.push(obj);

		// Check blockheight and timestamp to notify synced status
		timediff = new Date() / 1000 - blockHeader['timestamp'];
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
