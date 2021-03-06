import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable()
export class CreateSchemaService {

  constructor(private http: HttpClient) { }

  createSchema(schema: any): Observable<any> {
    return this.http.post<any>('/api/createSchema', schema);
  }

  insertSchema(schema: any): Observable<any> {
    return this.http.post<any>('/api/schema', schema);
  }

  deleteSchema(schema: any): Observable<any> {
    return this.http.delete(`/api/schema/${schema._id}`, { responseType: 'text' });
  }

  getAllSchema(): Observable<any> {
    return this.http.get<any>('/api/schemas');
  }

}
