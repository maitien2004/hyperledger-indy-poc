import Ledger from '../models/ledger';
import BaseCtrl from './base';
import indy = require('indy-sdk');

export default class LedgerCtrl extends BaseCtrl {
  model = Ledger;

  delete = (req, res) => {
    this.model.findOne({ _id: req.params.id }, (err, item) => {
      try {
        //Delete wallet
        if (item.stewardName) {
          let walletConfig = { 'id': item.stewardName + 'Wallet' };
          let walletCredentials = { 'key': item.stewardName + '_key' };
          indy.deleteWallet(walletConfig, walletCredentials);
        }

        //Delete pool
        if (item.poolName) indy.deletePoolLedgerConfig(item.poolName);

        //Delete on DB
        this.model.findOneAndRemove({ _id: req.params.id }, (err) => {
          if (err) { return console.error(err); }
          res.sendStatus(200);
        });
      } catch (e) {
        console.log(e);
        res.status(404).json({
          message: 'Ledger not found.'
        });
      }
    });
  }
}
