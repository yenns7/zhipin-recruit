import { api } from '../../lib/api';

export const candidatesApi = {
  listCandidates: api.listCandidates,
  searchCandidates: api.searchCandidates,
  getCandidate: api.getCandidate,
  retryCandidateParse: api.retryCandidateParse,
  getCandidatePipelines: api.getCandidatePipelines,
  getCandidateJourney: api.getCandidateJourney,
  reassignCandidate: api.reassignCandidate,
};
