import { HTTPCache, RESTDataSource } from 'apollo-datasource-rest';
import { getEnv } from '../utils';

export default class EngagesAPI extends RESTDataSource {
  constructor() {
    super();

    const ENGAGES_API_DOMAIN = getEnv({ name: 'ENGAGES_API_DOMAIN' });

    this.baseURL = ENGAGES_API_DOMAIN;
    this.httpCache = new HTTPCache();
  }

  public async send(params) {
    return this.post(
      `/engages/send`, // path
      params, // request body
    );
  }

  public async engagesConfigDetail() {
    return this.get(`/configs/detail`);
  }

  public async engagesConfigSave(params) {
    return this.post(`/configs/save`, params);
  }

  public async engagesStats(engageMessageId) {
    return this.get(`/deliveryReports/statsList/${engageMessageId}`);
  }
}