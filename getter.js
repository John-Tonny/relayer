
"use strict"

class Getter {
    constructor(web3) {
        this.web3 = web3;
    }
    setWeb3(web3){
        console.log("Getter: Switched web3 provider");
        this.web3 = web3;
    }
    async assertConnected() {
        if(!this.web3.currentProvider){
            console.error("Getter: Web3 not connected!");	
            return false;	
        }
        return true;
    }

    downloadBlocks(blocks){
        if(!this.assertConnected())
            return;
        var self = this;

        return new Promise(function(resolve, reject){
            var blockDict = {}; //temp storage for the received blocks

            var requestedBlocks = 0; //the amount of blocks we have requested to receive
            var receivedBlocks = 0; //how many blocks have been successfully received
            var expectedBlocks = blocks.length;
            var lastRequestedBlock = 0;

            console.log("Getter: Downloading " + blocks.length + " blocks starting from block " + blocks[0]);


            var handler = function(err, block){
                if (err) {
                    resolve(null);
                }
                else {

                    if(block == null){
                        console.error("Getter: Received empty block!");
                    } else {
                        blockDict[block.number] = block;
                    }

                    receivedBlocks++;


                    if(receivedBlocks >= expectedBlocks){
                        console.log("Getter: Received all blocks...");
                        resolve(blockDict);
                    }
                }
            }

            self.requestBlocks(blocks, handler);
        });
    }

    //requests blocks from given array of block numbers
    async requestBlocks(blocks, handler){
        const batch = new this.web3.BatchRequest();
        for(let i=0; i<blocks.length; i++) {
            batch.add(this.requestBlock(blocks[i], handler));
        }
        await batch.execute();
    }

    //requests a block and calls the given handler with the result
    requestBlock(blockN, handler, includeTXs=false){
        return this.web3.eth.getBlock.request(blockN, includeTXs, handler);
    }


    async getAll(blocks) {
        if(!this.assertConnected())
            return;
        return this.downloadBlocks(blocks);
    }
}

module.exports = Getter;

