import Admin from '../models/admin';
import BaseCtrl from './base';
import * as jwt from 'jsonwebtoken';

import indy = require('indy-sdk');
import assert = require('assert');
import mkdirp = require('mkdirp');
import fs = require('fs');
import os = require('os');

export default class adminCtrl extends BaseCtrl {
  model = Admin;

  login = (req, res) => {
    this.model.findOne({ email: req.body.email }, (err, user) => {
      if (!user) { return res.sendStatus(403); }
      user.comparePassword(req.body.password, (error, isMatch) => {
        if (!isMatch) { return res.sendStatus(403); }
        const token = jwt.sign({ user: user }, process.env.SECRET_TOKEN); // , { expiresIn: 10 } seconds
        res.status(200).json({ token: token });
      });
    });
  }

  // Step: 2
  // URL: /api/addTrustAnchor
  // Body:
  // {
  //   "trustAnchorName": "government",
  //   "poolName": "indy",
  //   "stewardName": "mxtien",
  //   "stewardDid": "Th7MpTaRZVRYnPiabds81Y"
  // }
  addTrustAnchor = async (req, res) => {
    let poolName = req.body.poolName;
    let stewardName = req.body.stewardName;
    let stewardDid = req.body.stewardDid;
    let stewardWalletConfig = { 'id': stewardName + 'Wallet' };
    let stewardWalletCredentials = { 'key': stewardName + '_key' };
    let trustAnchorName = req.body.trustAnchorName;
    let trustAnchorWalletConfig = { 'id': trustAnchorName + 'Wallet' };
    let trustAnchorWalletCredentials = { 'key': trustAnchorName + '_key' };
    let poolHandle, stewardWalletHandle;
    let trustAnchorWallet, stewardTrustAnchorKey, trustAnchorStewardDid, trustAnchorStewardKey;

    try {
      await indy.setProtocolVersion(2);
      //Open pool ledger
      poolHandle = await indy.openPoolLedger(poolName);

      //Open Steward wallet
      stewardWalletHandle = await indy.openWallet(stewardWalletConfig, stewardWalletCredentials);

      //Create Trust Anchor wallet and make a connection with Steward
      [trustAnchorWallet, stewardTrustAnchorKey, trustAnchorStewardDid, trustAnchorStewardKey] = await this.onboarding(poolHandle, "Sovrin Steward", stewardWalletHandle, stewardDid, trustAnchorName, null, trustAnchorWalletConfig, trustAnchorWalletCredentials);

      //Create Trust Anchor DID and add it into ledger
      let trustAnchorDID = await this.getVerinym(poolHandle, "Sovrin Steward", stewardWalletHandle, stewardDid,
        stewardTrustAnchorKey, trustAnchorName, trustAnchorWallet, trustAnchorStewardDid,
        trustAnchorStewardKey, 'TRUST_ANCHOR');

      //Close trust anchor wallet
      await indy.closeWallet(trustAnchorWallet);

      //Close steward wallet
      await indy.closeWallet(stewardWalletHandle);

      //Close pool ledger
      await indy.closePoolLedger(poolHandle);

      if (trustAnchorDID) {
        res.status(200).json({
          trustAnchorName: trustAnchorName,
          trustAnchorDID: trustAnchorDID,
          trustAnchorWallet: trustAnchorWalletConfig.id,
          stewardTrustAnchorKey: stewardTrustAnchorKey,
          trustAnchorStewardDid: trustAnchorStewardDid,
          trustAnchorStewardKey: trustAnchorStewardKey
        });
      } else {
        res.sendStatus(403);
      }
    } catch (error) {
      console.log(error);
      res.sendStatus(403);
    } finally {
      if (trustAnchorWallet) await indy.closeWallet(trustAnchorWallet);
      if (stewardWalletHandle) await indy.closeWallet(stewardWalletHandle);
      if (poolHandle) await indy.closePoolLedger(poolHandle);
    }
  }

  // Step: 1
  // URL: /api/createPoolLedger
  // Body:
  // {
  //   "poolName":"indy",
  //   "stewardName":"mxtien"
  // }
  createPoolLedger = async (req, res) => {
    let poolName = req.body.poolName;
    let stewardName = req.body.stewardName;

    // Create Pool Ledger Config
    let poolGenesisTxnPath = await this.getPoolGenesisTxnPath(poolName);
    let poolConfig = {
      "genesis_txn": poolGenesisTxnPath
    };

    try {
      await indy.createPoolLedgerConfig(poolName, poolConfig);
    } catch (e) {
      if (e.message !== "PoolLedgerConfigAlreadyExistsError") {
        console.log(e);
        res.sendStatus(403);
      }
    }

    await indy.setProtocolVersion(2);

    //Open pool ledger
    let poolHandle = await indy.openPoolLedger(poolName);

    //Create Steward wallet
    let stewardWalletConfig = { 'id': stewardName + 'Wallet' };
    let stewardWalletCredentials = { 'key': stewardName + '_key' };

    try {
      await indy.createWallet(stewardWalletConfig, stewardWalletCredentials);
    } catch (e) {
      if (e.message !== "WalletAlreadyExistsError") {
        console.log(e);
        if (poolHandle) await indy.closePoolLedger(poolHandle);
        res.sendStatus(403);
      }
    }

    //Open Steward wallet
    let stewardWalletHandle = await indy.openWallet(stewardWalletConfig, stewardWalletCredentials);

    //Create and store DID into wallet
    let stewardDid, stewardKey;
    try {
      [stewardDid, stewardKey] = await indy.createAndStoreMyDid(stewardWalletHandle, {});
    } catch (e) {
      console.log(e);
      res.sendStatus(403);
    } finally {
      //Close steward wallet
      if (stewardWalletHandle) await indy.closeWallet(stewardWalletHandle);

      //Close pool ledger  
      if (poolHandle) await indy.closePoolLedger(poolHandle);
    }

    if (stewardDid && stewardKey) {
      res.status(200).json({
        stewardName: stewardName,
        stewardDid: stewardDid,
        stewardKey: stewardKey,
        poolName: poolName
      });
    } else {
      res.sendStatus(403);
    }
  }

  // Function for create stuff
  toJson(val) {
    if (val === null || val === void 0) {
      return null
    }
    if (typeof val === 'string') {
      return val
    }
    return JSON.stringify(val)
  }

  onboarding = async function (poolHandle, From, fromWallet, fromDid, to, toWallet, toWalletConfig, toWalletCredentials) {
    console.log(`\"${From}\" > Create and store in Wallet \"${From} ${to}\" DID`);
    let [fromToDid, fromToKey] = await indy.createAndStoreMyDid(fromWallet, {});

    console.log(`\"${From}\" > Send Nym to Ledger for \"${From} ${to}\" DID`);
    await this.sendNym(poolHandle, fromWallet, fromDid, fromToDid, fromToKey, null);

    console.log(`\"${From}\" > Send connection request to ${to} with \"${From} ${to}\" DID and nonce`);
    let connectionRequest = {
      did: fromToDid,
      nonce: 123456789
    };

    if (!toWallet) {
      console.log(`\"${to}\" > Create wallet"`);
      try {
        await indy.createWallet(toWalletConfig, toWalletCredentials)
      } catch (e) {
        if (e.message !== "WalletAlreadyExistsError") {
          throw e;
        }
      }
      toWallet = await indy.openWallet(toWalletConfig, toWalletCredentials);
    }

    console.log(`\"${to}\" > Create and store in Wallet \"${to} ${From}\" DID`);
    let [toFromDid, toFromKey] = await indy.createAndStoreMyDid(toWallet, {});

    console.log(`\"${to}\" > Get key for did from \"${From}\" connection request`);
    let fromToVerkey = await indy.keyForDid(poolHandle, toWallet, connectionRequest.did);

    console.log(`\"${to}\" > Anoncrypt connection response for \"${From}\" with \"${to} ${From}\" DID, verkey and nonce`);
    let connectionResponse = JSON.stringify({
      'did': toFromDid,
      'verkey': toFromKey,
      'nonce': connectionRequest['nonce']
    });
    let anoncryptedConnectionResponse = await indy.cryptoAnonCrypt(fromToVerkey, Buffer.from(connectionResponse, 'utf8'));

    console.log(`\"${to}\" > Send anoncrypted connection response to \"${From}\"`);

    console.log(`\"${From}\" > Anondecrypt connection response from \"${to}\"`);
    let decryptedConnectionResponse = JSON.parse(Buffer.from(await indy.cryptoAnonDecrypt(fromWallet, fromToKey, anoncryptedConnectionResponse)).toString());

    console.log(`\"${From}\" > Authenticates \"${to}\" by comparision of Nonce`);
    if (connectionRequest['nonce'] !== decryptedConnectionResponse['nonce']) {
      throw Error("nonces don't match!");
    }

    console.log(`\"${From}\" > Send Nym to Ledger for \"${to} ${From}\" DID`);
    await this.sendNym(poolHandle, fromWallet, fromDid, decryptedConnectionResponse['did'], decryptedConnectionResponse['verkey'], null);

    return [toWallet, fromToKey, toFromDid, toFromKey, decryptedConnectionResponse];
  }

  getVerinym = async function (poolHandle, From, fromWallet, fromDid, fromToKey, to, toWallet, toFromDid, toFromKey, role) {
    console.log(`\"${to}\" > Create and store in Wallet \"${to}\" new DID"`);
    let [toDid, toKey] = await indy.createAndStoreMyDid(toWallet, {});

    console.log(`\"${to}\" > Authcrypt \"${to} DID info\" for \"${From}\"`);
    let didInfoJson = JSON.stringify({
      'did': toDid,
      'verkey': toKey
    });
    let authcryptedDidInfo = await indy.cryptoAuthCrypt(toWallet, toFromKey, fromToKey, Buffer.from(didInfoJson, 'utf8'));

    console.log(`\"${to}\" > Send authcrypted \"${to} DID info\" to ${From}`);

    console.log(`\"${From}\" > Authdecrypted \"${to} DID info\" from ${to}`);
    let [senderVerkey, authdecryptedDidInfo] =
      await indy.cryptoAuthDecrypt(fromWallet, fromToKey, Buffer.from(authcryptedDidInfo));

    let authdecryptedDidInfoJson = JSON.parse(Buffer.from(authdecryptedDidInfo).toString());
    console.log(`\"${From}\" > Authenticate ${to} by comparision of Verkeys`);
    let retrievedVerkey = await indy.keyForDid(poolHandle, fromWallet, toFromDid);
    if (senderVerkey !== retrievedVerkey) {
      throw Error("Verkey is not the same");
    }

    console.log(`\"${From}\" > Send Nym to Ledger for \"${to} DID\" with ${role} Role`);
    await this.sendNym(poolHandle, fromWallet, fromDid, authdecryptedDidInfoJson['did'], authdecryptedDidInfoJson['verkey'], role);

    return toDid
  }

  sendNym = async function (poolHandle, walletHandle, Did, newDid, newKey, role) {
    let nymRequest = await indy.buildNymRequest(Did, newDid, newKey, null, role);
    await indy.signAndSubmitRequest(poolHandle, walletHandle, Did, nymRequest);
  }

  sendSchema = async function (poolHandle, walletHandle, Did, schema) {
    // schema = JSON.stringify(schema); // FIXME: Check JSON parsing
    let schemaRequest = await indy.buildSchemaRequest(Did, schema);
    await indy.signAndSubmitRequest(poolHandle, walletHandle, Did, schemaRequest)
  }

  sendCredDef = async function (poolHandle, walletHandle, did, credDef) {
    let credDefRequest = await indy.buildCredDefRequest(did, credDef);
    await indy.signAndSubmitRequest(poolHandle, walletHandle, did, credDefRequest);
  }

  getSchema = async function (poolHandle, did, schemaId) {
    let getSchemaRequest = await indy.buildGetSchemaRequest(did, schemaId);
    let getSchemaResponse = await indy.submitRequest(poolHandle, getSchemaRequest);
    return await indy.parseGetSchemaResponse(getSchemaResponse);
  }

  getCredDef = async function (poolHandle, did, schemaId) {
    let getCredDefRequest = await indy.buildGetCredDefRequest(did, schemaId);
    let getCredDefResponse = await indy.submitRequest(poolHandle, getCredDefRequest);
    return await indy.parseGetCredDefResponse(getCredDefResponse);
  }

  proverGetEntitiesFromLedger = async function (poolHandle, did, identifiers, actor) {
    let schemas = {};
    let credDefs = {};
    let revStates = {};

    for (let referent of Object.keys(identifiers)) {
      let item = identifiers[referent];
      console.log(`\"${actor}\" -> Get Schema from Ledger`);
      let [receivedSchemaId, receivedSchema] = await this.getSchema(poolHandle, did, item['schema_id']);
      schemas[receivedSchemaId] = receivedSchema;

      console.log(`\"${actor}\" -> Get Claim Definition from Ledger`);
      let [receivedCredDefId, receivedCredDef] = await this.getCredDef(poolHandle, did, item['cred_def_id']);
      credDefs[receivedCredDefId] = receivedCredDef;

      if (item.rev_reg_seq_no) {
        // TODO Create Revocation States
      }
    }

    return [schemas, credDefs, revStates];
  }

  verifierGetEntitiesFromLedger = async function (poolHandle, did, identifiers, actor) {
    let schemas = {};
    let credDefs = {};
    let revRegDefs = {};
    let revRegs = {};

    for (let referent of Object.keys(identifiers)) {
      let item = identifiers[referent];
      console.log(`"${actor}" -> Get Schema from Ledger`);
      let [receivedSchemaId, receivedSchema] = await this.getSchema(poolHandle, did, item['schema_id']);
      schemas[receivedSchemaId] = receivedSchema;

      console.log(`"${actor}" -> Get Claim Definition from Ledger`);
      let [receivedCredDefId, receivedCredDef] = await this.getCredDef(poolHandle, did, item['cred_def_id']);
      credDefs[receivedCredDefId] = receivedCredDef;

      if (item.rev_reg_seq_no) {
        // TODO Get Revocation Definitions and Revocation Registries
      }
    }

    return [schemas, credDefs, revRegDefs, revRegs];
  }

  authDecrypt = async function (walletHandle, key, message) {
    let [fromVerkey, decryptedMessageJsonBuffer] = await indy.cryptoAuthDecrypt(walletHandle, key, message);
    let decryptedMessage = JSON.parse(decryptedMessageJsonBuffer);
    let decryptedMessageJson = JSON.stringify(decryptedMessage);
    return [fromVerkey, decryptedMessageJson, decryptedMessage];
  }

  getPoolGenesisTxnPath = async function (poolName) {
    let path = `${os.tmpdir()}/indy/${poolName}.txn`;
    await this.savePoolGenesisTxnFile(path);
    return path
  };

  poolGenesisTxnData = async function () {
    let poolIp = "127.0.0.1";
    return `{"reqSignature": {}, "txn": {"data": {"data": {"alias": "Node1", "blskey": "4N8aUNHSgjQVgkpm8nhNEfDf6txHznoYREg9kirmJrkivgL4oSEimFF6nsQ6M41QvhM2Z33nves5vfSn9n1UwNFJBYtWVnHYMATn76vLuL3zU88KyeAYcHfsih3He6UHcXDxcaecHVz6jhCYz1P2UZn2bDVruL5wXpehgBfBaLKm3Ba", "client_ip": "${poolIp}", "client_port": 9702, "node_ip": "${poolIp}", "node_port": 9701, "services": ["VALIDATOR"]}, "dest": "Gw6pDLhcBcoQesN72qfotTgFa7cbuqZpkX3Xo6pLhPhv"}, "metadata": {"from": "Th7MpTaRZVRYnPiabds81Y"}, "type": "0"}, "txnMetadata": {"seqNo": 1, "txnId": "fea82e10e894419fe2bea7d96296a6d46f50f93f9eeda954ec461b2ed2950b62"}, "ver": "1"}
            {"reqSignature": {}, "txn": {"data": {"data": {"alias": "Node2", "blskey": "37rAPpXVoxzKhz7d9gkUe52XuXryuLXoM6P6LbWDB7LSbG62Lsb33sfG7zqS8TK1MXwuCHj1FKNzVpsnafmqLG1vXN88rt38mNFs9TENzm4QHdBzsvCuoBnPH7rpYYDo9DZNJePaDvRvqJKByCabubJz3XXKbEeshzpz4Ma5QYpJqjk", "client_ip": "${poolIp}", "client_port": 9704, "node_ip": "${poolIp}", "node_port": 9703, "services": ["VALIDATOR"]}, "dest": "8ECVSk179mjsjKRLWiQtssMLgp6EPhWXtaYyStWPSGAb"}, "metadata": {"from": "EbP4aYNeTHL6q385GuVpRV"}, "type": "0"}, "txnMetadata": {"seqNo": 2, "txnId": "1ac8aece2a18ced660fef8694b61aac3af08ba875ce3026a160acbc3a3af35fc"}, "ver": "1"}
            {"reqSignature": {}, "txn": {"data": {"data": {"alias": "Node3", "blskey": "3WFpdbg7C5cnLYZwFZevJqhubkFALBfCBBok15GdrKMUhUjGsk3jV6QKj6MZgEubF7oqCafxNdkm7eswgA4sdKTRc82tLGzZBd6vNqU8dupzup6uYUf32KTHTPQbuUM8Yk4QFXjEf2Usu2TJcNkdgpyeUSX42u5LqdDDpNSWUK5deC5", "client_ip": "${poolIp}", "client_port": 9706, "node_ip": "${poolIp}", "node_port": 9705, "services": ["VALIDATOR"]}, "dest": "DKVxG2fXXTU8yT5N7hGEbXB3dfdAnYv1JczDUHpmDxya"}, "metadata": {"from": "4cU41vWW82ArfxJxHkzXPG"}, "type": "0"}, "txnMetadata": {"seqNo": 3, "txnId": "7e9f355dffa78ed24668f0e0e369fd8c224076571c51e2ea8be5f26479edebe4"}, "ver": "1"}
            {"reqSignature": {}, "txn": {"data": {"data": {"alias": "Node4", "blskey": "2zN3bHM1m4rLz54MJHYSwvqzPchYp8jkHswveCLAEJVcX6Mm1wHQD1SkPYMzUDTZvWvhuE6VNAkK3KxVeEmsanSmvjVkReDeBEMxeDaayjcZjFGPydyey1qxBHmTvAnBKoPydvuTAqx5f7YNNRAdeLmUi99gERUU7TD8KfAa6MpQ9bw", "client_ip": "${poolIp}", "client_port": 9708, "node_ip": "${poolIp}", "node_port": 9707, "services": ["VALIDATOR"]}, "dest": "4PS3EDQ3dW1tci1Bp6543CfuuebjFrg36kLAUcskGfaA"}, "metadata": {"from": "TWwCRQRZ2ZHMJFn9TzLp7W"}, "type": "0"}, "txnMetadata": {"seqNo": 4, "txnId": "aa5e817d7cc626170eca175822029339a444eb0ee8f0bd20d3b0b76e566fb008"}, "ver": "1"}`;
  }

  savePoolGenesisTxnFile = async function (filePath) {
    let data = await this.poolGenesisTxnData();
    await this.mkdir(filePath);
    return fs.writeFileSync(filePath, data, 'utf8');
  }

  mkdir = async function (filePath) {
    return new Promise((resolve, reject) => {
      let folderPath = filePath.split('/').slice(0, filePath.split('/').length - 1).join('/');
      mkdirp(folderPath, function (err, res) {
        if (err) reject(err);
        else resolve(res);
      })
    })
  }
}
