import { Component, OnInit, ElementRef, ViewChild } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { ToastComponent } from '../shared/toast/toast.component';

import { GovernmentService } from '../services/government.service';
import { CreateSchemaService } from '../services/schema.service';
import { LedgerService } from '../services/ledger.service';
import { TrustAnchorService } from '../services/anchor.service';

@Component({
  selector: 'app-government',
  templateUrl: './government.component.html'
})
export class GovernmentComponent implements OnInit {

  @ViewChild('fileInput') fileInput: ElementRef;

  hashResponse;
  binaryConverted;
  credentialDefinitions = [];
  residentIdCards = [];
  ledgers = [];
  TrustAnchors = [];
  Schemas = [];
  isLoading = true;

  // Patient validation
  residentForm: FormGroup;

  id = new FormControl('', [
    Validators.required
  ]);
  name = new FormControl('', [
    Validators.required
  ]);
  dob = new FormControl('', [
    Validators.required
  ]);
  gender = new FormControl('', [
    Validators.required
  ]);
  nationality = new FormControl('', [
    Validators.required
  ]);
  hometown = new FormControl('', [
    Validators.required
  ]);
  profile_image_hash = new FormControl('', [
    Validators.required
  ]);

  constructor(
    private governmentService: GovernmentService,
    private formBuilder: FormBuilder,
    public toast: ToastComponent,
    private createSchemaService: CreateSchemaService,
    private ledgerService: LedgerService,
    private trustAnchorService: TrustAnchorService) { }

  ngOnInit() {
    this.getCredentialDefinitions();
    this.gettingIdCard();
    this.getTrustAnchor();
    this.getLedger();
    this.getSchema();

    // Build form for patient
    this.residentForm = this.formBuilder.group({
      id: this.id,
      name: this.name,
      dob: this.dob,
      gender: this.gender,
      nationality: this.nationality,
      hometown: this.hometown,
      profile_image_hash: this.profile_image_hash
    });

  }

  // Patient class notification
  setClassID() {
    return { 'has-danger': !this.id.pristine && !this.id.valid };
  }

  setClassName() {
    return { 'has-danger': !this.name.pristine && !this.name.valid };
  }

  setClassDOB() {
    return { 'has-danger': !this.dob.pristine && !this.dob.valid };
  }

  setClassGender() {
    return { 'has-danger': !this.gender.pristine && !this.gender.valid };
  }

  setClassNationality() {
    return { 'has-danger': !this.nationality.pristine && !this.nationality.valid };
  }

  setClassHometown() {
    return { 'has-danger': !this.hometown.pristine && !this.hometown.valid };
  }

  setClassProfileImageHash() {
    return { 'has-danger': !this.profile_image_hash.pristine && !this.profile_image_hash.valid };
  }

  getCredentialDefinitions() {
    this.governmentService.getAllCredentialDefinition().subscribe(
      data => this.credentialDefinitions = data,
      error => console.log(error),
      () => this.isLoading = false
    );
  }

  gettingIdCard() {
    this.governmentService.getAllIdCard().subscribe(
      data => this.residentIdCards = data,
      error => console.log(error),
      () => this.isLoading = false
    );
  }

  getTrustAnchor() {
    this.trustAnchorService.getAllTrustAnchor().subscribe(
      data => this.TrustAnchors = data,
      error => console.log(error),
      () => this.isLoading = false
    );
  }

  getLedger() {
    this.ledgerService.getAllPoolLedger().subscribe(
      data => this.ledgers = data,
      error => console.log(error),
      () => this.isLoading = false
    );
  }

  getSchema() {
    this.createSchemaService.getAllSchema().subscribe(
      data => this.Schemas = data,
      error => console.log(error)
    );
  }

  deleteCredentialDefinition(credentialDefinition) {
    if (window.confirm('Are you sure you want to delete this credential?')) {
      this.governmentService.deleteCredentialDefinition(credentialDefinition).subscribe(
        res => {
          this.getCredentialDefinitions();
          this.toast.setMessage('Credential Definition deleted successfully.', 'success');
        },
        error => {
          console.log(error);
          this.toast.setMessage('Credential Definition can not deleted.', 'danger');
        }
      );
    }
  }

  deletePatientPrescription(patientPrescription) {
    if (window.confirm('Are you sure you want to delete this id card?')) {
      this.governmentService.deleteIdCard(patientPrescription).subscribe(
        data => {
          this.gettingIdCard();
          this.toast.setMessage('ID card deleted successfully.', 'success');
        },
        error => {
          console.log(error);
          this.toast.setMessage('ID card can not deleted.', 'danger');
        }
      );
    }
  }

  createIdCard() {
    this.isLoading = true;
    let data = this.residentForm.value;
    let idCard = {
      residentName: data.name.split(' ').join(''),
      poolName: this.ledgers[0].poolName,
      governmentIdCardCredDefId: this.credentialDefinitions[0].governmentIdCardCredDefId,
      governmentDid: 'null',
      governmentName: 'null',
      idCardCredValues: {
        id: { raw: this.residentForm.value.id, encoded: '1' },
        name: { raw: this.residentForm.value.name, encoded: '1' },
        dob: { raw: this.residentForm.value.dob, encoded: '1' },
        gender: { raw: this.residentForm.value.gender, encoded: '1' },
        nationality: { raw: this.residentForm.value.nationality, encoded: '1' },
        hometown: { raw: this.residentForm.value.hometown, encoded: '1' },
        profile_image_hash: { raw: this.hashResponse, encoded: '1' },
        created_at: { raw: new Date().toISOString().slice(0, 10), encoded: '1' },
        status: { raw: '1', encoded: '1' }
      }
    };

    this.TrustAnchors.forEach(TrustAnchor => {
      let anchorName = TrustAnchor.trustAnchorName.toLowerCase();
      if (anchorName === 'government' || anchorName === 'gov') {
        idCard.governmentDid = TrustAnchor.trustAnchorDID;
        idCard.governmentName = TrustAnchor.trustAnchorName;
      }
    });

    this.governmentService.createIdCard(idCard).subscribe(
      res => {
        this.governmentService.insertIdCard(res).subscribe(
          res => {
            this.gettingIdCard();
            this.isLoading = false;
            this.toast.setMessage('Id Card created successfully.', 'success');
          },
          error => {
            console.log(error);
            this.isLoading = false;
            this.toast.setMessage('Id Card can not created', 'danger');
          }
        );
      },
      error => {
        console.log(error);
        this.isLoading = false;
        this.toast.setMessage('Resident Id Card can not created', 'danger');
      }
    );
  }

  setupCredentialDefinition() {
    this.isLoading = true;

    let credentialDefinition = {
      poolName: this.ledgers[0].poolName,
      governmentDid: 'null',
      governmentName: 'null'
    }

    this.TrustAnchors.forEach(TrustAnchor => {
      let anchorName = TrustAnchor.trustAnchorName.toLowerCase();
      if (anchorName === 'government' || anchorName === 'gov') {
        credentialDefinition.governmentDid = TrustAnchor.trustAnchorDID,
          credentialDefinition.governmentName = TrustAnchor.trustAnchorName
      }
    });

    Object.keys(credentialDefinition).forEach(key => {
      this.Schemas[this.Schemas.length - 1][key] = credentialDefinition[key];
    });

    this.governmentService.setupCredentialDefinition(this.Schemas[0]).subscribe(
      res => {
        this.governmentService.insertCredentialDefinition(res).subscribe(
          res => {
            this.getCredentialDefinitions();
            this.isLoading = false;
            this.toast.setMessage('Credential Definition created successfully.', 'success');
          },
          error => {
            console.log(error);
            this.isLoading = false;
            this.toast.setMessage('Credential Definition can not inserted to database.', 'danger');
          }
        );
      },
      error => {
        console.log(error);
        this.isLoading = false;
        this.toast.setMessage('Can not setup credential definition!!!', 'danger');
      }
    );
  }

  onFileChange(event) {
    let reader = new FileReader();
    if (event.target.files && event.target.files.length > 0) {
      let file = event.target.files[0];
      reader.readAsDataURL(file);
      reader.onload = () => {
        this.governmentService.hashFile({ binary: reader.result }).subscribe(
          res => {
            this.hashResponse = res.hash.sha256;
            this.toast.setMessage('Hash successfully.', 'success');
          },
          error => {
            console.log(error);
            this.toast.setMessage('You can not get the hash of this file!!!', 'danger');
          }
        );
      };
    }
  }

  createSchema() {
    this.isLoading = true;
    let setupSchema = {
      governmentName: 'null',
      governmentDid: 'null',
      poolName: this.ledgers[0].poolName,
      schema: ["id", "name", "dob", "gender", "nationality", "hometown", "profile_image_hash", "created_at", "status"]
    };

    this.TrustAnchors.forEach(TrustAnchor => {
      let anchorName = TrustAnchor.trustAnchorName.toLowerCase();
      if (anchorName === 'government' || anchorName === 'gov') {
        setupSchema.governmentName = TrustAnchor.trustAnchorName;
        setupSchema.governmentDid = TrustAnchor.trustAnchorDID;
      }
    });

    this.createSchemaService.createSchema(setupSchema).subscribe(
      res => {
        this.createSchemaService.insertSchema(res).subscribe(
          res => {
            this.getSchema();
            this.isLoading = false;
            this.toast.setMessage('Schema created successfully.', 'success');
          }
        );
      },
      error => {
        this.isLoading = false;
        console.log(error);
      }
    );
  }

  deleteSchema(schema: any) {
    if (window.confirm('Are you sure you want to delete ' + schema.prescriptionSchemaId + '?')) {
      this.createSchemaService.deleteSchema(schema).subscribe(
        data => this.toast.setMessage('Schema deleted successfully.', 'success'),
        error => console.log(error),
        () => this.getSchema()
      );
    }
  }

}
