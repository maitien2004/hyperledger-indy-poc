import TrustAnchor from '../models/trustAnchor';
import BaseCtrl from './base';
import indy = require('indy-sdk');

export default class TrustAnchorCtrl extends BaseCtrl {
  model = TrustAnchor;

  delete = (req, res) => {
    this.model.findOne({ _id: req.params.id }, (err, item) => {
      try {
        if (item.trustAnchorName) {
          let walletConfig = { 'id': item.trustAnchorName + 'Wallet' };
          let walletCredentials = { 'key': item.trustAnchorName + '_key' };
          indy.deleteWallet(walletConfig, walletCredentials);
        }
        res.status(200).json(item);
      } catch (e) {
        console.log(e);
        res.status(404).json({
          message: 'Trust Anchor not found.'
        });
      }
    });
  }
}
