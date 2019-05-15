#!/usr/bin/env node

const Web3 = require('web3');
const request = require('request');
/* 
 *  Usage:  Subscribe to Geth node and push header to syscoin via RPC 
 *
 */

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

/* Global Variables */
var highestBlock = 0;
var currentBlock = 0; 
var timediff = 0;

/* Initialize Geth Web3 */
var web3 = new Web3("ws://127.0.0.1:" + argv.ethwsport);
var provider = web3.currentProvider;
var collection = [];
var missingBlocks = [];
var requestedBlocks = [];
var downloadingBlocks = false;

SetupListener();

function SetupListener() {
    provider.on("error", err => {
        console.log("web3 socket error\n")
    });

    provider.on("end", err => {
        console.log("web3 socket ended.  Retrying...\n");
        setTimeout(function () {
            provider = new Web3.providers.WebsocketProvider("ws://127.0.0.1:" + ethwsport);
            web3.setProvider(provider);
            SetupListener();
        }, 3000);
    });

    provider.on("connect", function () {SetupSubscriber()});
}

function SetupSubscriber() {
    console.log("Subscribed to newBlockHeaders");
    /* Geth subscriber for new block headers */
    const subscriptionHeader = web3.eth.subscribe('newBlockHeaders', (error, blockHeader) => {
        if (error) return console.error(error);
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
    });

    /* Timer for submitting header lists to Syscoin via RPC */
    const timer = setInterval(RPCsyscoinsetethheaders, 5000);
    function RPCsyscoinsetethheaders() {
        // Check if there's anything in the collection
        if (collection.length == 0) {
            // console.log("collection is empty");
            return;
        }

        if (highestBlock != 0 && currentBlock >= highestBlock && timediff < 600) {
            console.log("Geth is synced based on block height and timestamp");
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
                console.error('An error has occurred: ', error);
            } 
        });

        console.log("syscoinsetethheaders: ", JSON.stringify(collection));
        collection = [];
    };

    /*  Subscription for Geth syncing status */
    const subscriptionSync = web3.eth.subscribe('syncing', function(error, sync){
        if (error) return console.error(error);

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
                    console.log("Geth is synced based on syncing subscription");
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
        // console.log(options.body);

        request(options, (error, response, body) => {
            if (error) {
                console.error('An error has occurred: ', error);
            } else {
                console.log('Post successful: ', body);
                var parsedBody = JSON.parse(body);
                var missingBlockRanges = parsedBody.result.missing_blocks;
                var counter = 0;

                if (missingBlockRanges.length == 0) {
                    console.log(" there is no missing_blocks ");
                } else {
                    for(var i = 0; i < missingBlockRanges.length; i++) {
                        for(var i2 = missingBlockRanges[i].from; i2 <= missingBlockRanges[i].to; i2++) {
                            missingBlocks[i2] = true;
                            counter++;
                        }
                    }
                }
                console.log("missingBlocks count: ", counter);
            }
        });
        console.log("syscoinsetethstatus: ", params);
    };
    const timer2 = setInterval(retrieveBlock, 15000);
    function retrieveBlock() {
        missingBlocks.forEach(function(value, key) {
            if (requestedBlocks.hasOwnProperty(key) && requestedBlocks[key] == true) {
                return;
            }

            requestedBlocks[key] = true;
            if (value) {
                try {
                    web3.eth.getBlock(key, function(error, result) {
                        if (error) {
                            web3Infura.eth.getBlock(key, function(error, result){
                                if (error) {
                                    requestedBlocks[key] = false;
                                    console.log("infura error: ", error);
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
                } catch(e) {
                    requestedBlocks[key] = false;
                    console.log("getBlock: error2", e, key, missingBlocks[key], value, requestedBlocks[key]);
                }

            }
        });


    }
};
