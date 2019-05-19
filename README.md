Relayer - Light Weight Node.js app for Relaying Syscoin and Geth
================================================================

This app subscribes "newBlockHeaders" and "sync" from Go-Ethereum
via web3.js.  Then it pushes the data to syscoin via RPC through
`syscoinsetethheaders` and `syscoinsetethstatus`

Requirement
-----------
This repository current requires node v9.5.0 and pkg@4.3.1


How to Build
------------
`git clone https://www.github.com/syscoin/relayer`

`npm install`

`npm install pkg -g`

`pkg package.json`

This will produce portable binaries to be used in other systems. Note for linux builds it must be built in linux otherwise it will fail to launch.

How to Use
----------

`relayer -sysrpcuser [username] -sysrpcpw [password] -sysrpcport [port] -ethwsport [port]`
