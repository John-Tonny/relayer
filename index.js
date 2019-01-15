#!/usr/bin/env node

const axios = require('axios');
const Web3 = require('web3');
let argv = require('yargs')
     .usage('Usage: $0 -sysrpcuser [username] -sysrpcpw [password] -sysrpcport [port] -ethrpcport [port]')
     .default("sysrpcport", 8369)
     .default("ethrpcport", 8546)
     .argv
;
if (argv.sysrpcport < 0 || argv.sysrpcport > 65535) {
    console.log('Invalid Sys RPC port');
    exit();
}
if (argv.ethrpcport < 0 || argv.ethrpcport > 65535) {
		console.log('Invalid Eth RPC port');
		exit();
}


let web3 = new Web3("ws://127.0.0.1:" + argv.ethrpcport);
var collection = [];

const subscription = web3.eth.subscribe('newBlockHeaders', (error, blockHeader) => {
  if (error) return console.error(error);
  console.log(blockHeader);
  let obj = [blockHeader['number'],blockHeader['transactionsRoot']];
  console.log(obj);
  collection.push(obj);
  console.log(collection);
	
});

const timer = setInterval(pushToRPC, 50000);
function pushToRPC() {
	if (collection.length == 0) {
			console.log("collection is empty");
			return;
	} else {
			let instance = axios.create({
					timeout: 1000,
					auth: {
							username: 'u',
							password: 'p'
					},
					method: 'post',
			});

			var CallRPC = instance.post("http://localhost:18369", {"method":"syscoinmint", "params": JSON.stringify(collection)});
			console.log("pushing to rpc", JSON.stringify(collection));
			console.log("result: ", CallRPC);
			collection = [];
	}
}
// unsubscribes the subscription
subscription.unsubscribe((error, success) => {
if (error) return console.error(error);

    console.log('Successfully unsubscribed!');
	clearInterval(timer);

});
/*
const sync_subscription = web3.eth.subscribe('syncing', function(error, sync){
		console.log("sync_subscription: callback");
//    if (!error)
       // console.log(sync);
})
.on("data", function(sync){
    // show some syncing stats
    console.log("sync_subscription: on data");
})
.on("changed", function(isSyncing){
    if(isSyncing) {
		 console.log("sync_subscription: is_syncing = true");
        // stop app operation
    } else {
			console.log("sync_subscription: is_syncing = false");
        // regain app operation
    }
});
// unsubscribes the subscription
sync_subscription.unsubscribe(function(error, success){
    if(success)
        console.log('Successfully unsubscribed!');
});
*/
