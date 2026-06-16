import { api } from '../../lib/api';

export const demandsApi = {
  listDemands: api.listDemands,
  getDemand: api.getDemand,
  createDemand: api.createDemand,
  updateDemand: api.updateDemand,
  closeDemand: api.closeDemand,
  downgradeDemand: api.downgradeDemand,
};
