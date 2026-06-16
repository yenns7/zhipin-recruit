import { api } from '../../lib/api';

export const candidatesApi = {
  listCandidates: api.listCandidates,
  searchCandidates: api.searchCandidates,
  getCandidate: api.getCandidate,
  retryCandidateParse: api.retryCandidateParse,
  updateCandidateProfile: api.updateCandidateProfile,
  getCandidatePipelines: api.getCandidatePipelines,
  getCandidateJourney: api.getCandidateJourney,
  reassignCandidate: api.reassignCandidate,
  listJobs: api.listJobs,
  batchAddToPipeline: api.batchAddToPipeline,
};
