import TrustAnchor from '../models/trustAnchor';
import BaseCtrl from './base';
import indy = require('indy-sdk');

export default class TrustAnchorCtrl extends BaseCtrl {
  model = TrustAnchor;

  delete = (req, res) => {
    this.model.findOne({ _id: req.params.id }, (err, item) => {
      try {
        //Delete wallet
        if (item.trustAnchorName) {
          let walletConfig = { 'id': item.trustAnchorName + 'Wallet' };
          let walletCredentials = { 'key': item.trustAnchorName + '_key' };
          indy.deleteWallet(walletConfig, walletCredentials);
        }
        
        //Delete on DB
        this.model.findOneAndRemove({ _id: req.params.id }, (err) => {
          if (err) { return console.error(err); }
          res.sendStatus(200);
        });
      } catch (e) {
        console.log(e);
        res.status(404).json({
          message: 'Trust Anchor not found.'
        });
      }
    });
  }
}
