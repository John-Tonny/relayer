Relayer - Light Weight Node.js app for Relaying Syscoin and Geth
================================================================

This app subscribes "newBlockHeaders" and "sync" from Go-Ethereum
via web3.js.  Then it pushes the data to syscoin via RPC through
`syscoinsetethheaders` and `syscoinsetethstatus`

Requirement
-----------
This repository currently requires node v9.5.0 and pkg@4.3.1
Branch web3-2.0 will start to use node v12.7.0 and pkg@4.4.0
Please make sure you delete the node_modules folder and package-lock.json when switching between these 2 branches


How to Build
------------
`git clone https://www.github.com/syscoin/relayer`

`npm install`

`npm install pkg -g`

`pkg package.json`

This will produce portable binaries to be used in other systems.

The expected output is
```
> Targets not specified. Assuming:
  node9-linux-x64, node9-macos-x64, node9-win-x64
> Warning Cannot include addon %1 into executable.
  The addon must be distributed with executable as %2.
  /home/syscoin/relayer/node_modules/sha3/build/Release/sha3.node
  path-to-executable/sha3.node
> Warning Cannot include addon %1 into executable.
  The addon must be distributed with executable as %2.
  /home/syscoin/relayer/node_modules/scrypt/build/Release/scrypt.node
  path-to-executable/scrypt.node
> Warning Cannot include addon %1 into executable.
  The addon must be distributed with executable as %2.
  /home/syscoin/relayer/node_modules/web3-providers-ws/node_modules/websocket/build/Release/bufferutil.node
  path-to-executable/bufferutil.node
> Warning Cannot include addon %1 into executable.
  The addon must be distributed with executable as %2.
  /home/syscoin/relayer/node_modules/web3-providers-ws/node_modules/websocket/build/Release/validation.node
  path-to-executable/validation.node
```

The 4 .node files (sha3.node, scrypt.node, bufferutil.node and validation.node) need to be placed beside the final relayer binary for it to work. 


How to Use
----------

`relayer -sysrpcuser [username] -sysrpcpw [password] -sysrpcport [port] -ethwsport [port] -gethtestnet [0/1]`
