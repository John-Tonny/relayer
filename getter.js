
"use strict"
const maxAsyncRequests = 197;

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

	downloadBlocks(startBlock, endBlock){
		if(!this.assertConnected())
			return;
		var self = this;

		return new Promise(function(resolve, reject){
			var blockDict = {}; //temp storage for the received blocks

			var requestedBlocks = 0; //the amount of blocks we have requested to receive
			var receivedBlocks = 0; //how many blocks have been successfully received
			var expectedBlocks = endBlock - startBlock + 1;
			var lastRequestedBlock = 0;
		
			console.log("Getter: Downloading blocks from "+startBlock+" to "+endBlock);


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
						let missing = self.listMissingBlocks(blockDict, startBlock, endBlock);

						if(missing.length > 0){
							console.error("Getter: Detected missing blocks: "+missing);
							return;
						}

						console.log("Getter: Received all blocks...");
						resolve(blockDict);
					} else if(requestedBlocks < expectedBlocks){
						//get the next block
						lastRequestedBlock++;
						requestedBlocks++;
						self.requestBlock(lastRequestedBlock, handler);
					}
				}
			}

			let end = Math.min(startBlock + maxAsyncRequests - 1, endBlock);
			
			lastRequestedBlock = end;
			requestedBlocks = Math.abs(end - startBlock) + 1;

			self.requestBlockRange(startBlock, end, handler);
		});
	}

	//iterates the dict with keys from first to first+len and returns an array of missing keys
	listMissingBlocks(dict, first, last){
		let missing = [];

		for(let bl = first; bl <= last; bl++){
			if(dict[bl] == null){
				missing.push(bl);
			}
		}

		return missing;
	}

	//requests a given block range in the interval [start, end] (inclusive of end)
	async requestBlockRange(start, end, handler){
		const batch = new this.web3.BatchRequest();
		for(let i=start; i<=end; i++) {
			batch.add(this.requestBlock(i, handler));
		}
		await batch.execute();
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
		this.web3.eth.getBlock(blockN, includeTXs, handler);
	}


	async getAll(start, end) {
		if(!this.assertConnected())
			return;
		return this.downloadBlocks(start, end);
	}
}

module.exports = Getter;

