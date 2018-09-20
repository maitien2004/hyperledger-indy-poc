import Ledger from '../models/ledger';
import BaseCtrl from './base';
import indy from 'indy-sdk';

export default class LedgerCtrl extends BaseCtrl {
  model = Ledger;

  delete = (req, res) => {
    this.model.findOne({ _id: req.params.id }, (err, item) => {
      try {
        if (item.stewardName) {
          let walletConfig = { 'id': item.stewardName + 'Wallet' };
          let walletCredentials = { 'key': item.stewardName + '_key' };
          indy.deleteWallet(walletConfig, walletCredentials);
        }
        if (item.poolName) indy.deletePoolLedgerConfig(item.poolName);
        res.status(200).json(item);
      } catch (e) {
        console.log(e);
        res.status(404).json({
          message: 'Ledger not found.'
        });
      }
    });
  }
}
