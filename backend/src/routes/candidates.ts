import { Router } from 'express';
import { requireAdminSecret } from '../middleware/adminAuth.js';
import { dataStore } from '../storage/datastore.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { BadRequestError } from '../utils/httpError.js';
import type { Candidate, ElectionType, HouseId } from '../types/election.js';
import { isValidPostId, SCHOOL_POST_IDS, HOUSE_POST_IDS, isValidHouseId } from '../config/posts.js';

export const candidatesRouter = Router();

candidatesRouter.put(
  '/:candidateId',
  requireAdminSecret,
  asyncHandler((req, res) => {
    const { candidateId } = req.params;
    const { name, manifesto, imageUrl } = req.body as Partial<Candidate>;

    if (!candidateId) {
      throw new BadRequestError('Candidate ID is required');
    }

    const candidates = dataStore.getCandidates();
    const candidateIndex = candidates.findIndex((c) => c.id === candidateId);

    if (candidateIndex === -1) {
      throw new BadRequestError('Candidate not found');
    }

    const candidate = candidates[candidateIndex];

    // Update only the fields provided
    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        throw new BadRequestError('Name must be a non-empty string');
      }
      candidate.name = name.trim();
    }

    if (manifesto !== undefined) {
      candidate.manifesto = typeof manifesto === 'string' ? manifesto.trim() : undefined;
    }

    if (imageUrl !== undefined) {
      candidate.imageUrl = typeof imageUrl === 'string' ? imageUrl.trim() : undefined;
    }

    dataStore.setCandidates(candidates);

    res.json({ candidate });
  })
);

candidatesRouter.post(
  '/',
  requireAdminSecret,
  asyncHandler((req, res) => {
    const { id, name, post, electionType, house, manifesto, imageUrl } = req.body as Partial<Candidate>;

    if (!id || !name || !post) {
      throw new BadRequestError('ID, name, and post are required');
    }

    if (!isValidPostId(post)) {
      throw new BadRequestError('Invalid post ID');
    }

    // Determine election type from post if not provided
    let determinedElectionType: ElectionType;
    if (electionType) {
      determinedElectionType = electionType;
    } else {
      // Auto-determine from post
      determinedElectionType = SCHOOL_POST_IDS.includes(post as any) ? 'school' : 'house';
    }

    // Validate post matches election type
    if (determinedElectionType === 'school' && !SCHOOL_POST_IDS.includes(post as any)) {
      throw new BadRequestError('School election posts are: HB, HG, SSC, SRC, SCC');
    }
    if (determinedElectionType === 'house' && !HOUSE_POST_IDS.includes(post as any)) {
      throw new BadRequestError('House election posts are: HC, HCC, HSC');
    }

    // House is required for house elections
    if (determinedElectionType === 'house') {
      if (!house || !isValidHouseId(house)) {
        throw new BadRequestError('House is required for house election candidates');
      }
    }

    const candidates = dataStore.getCandidates();
    
    if (candidates.some((c) => c.id === id)) {
      throw new BadRequestError('Candidate ID already exists');
    }

    const newCandidate: Candidate = {
      id: id.trim(),
      name: name.trim(),
      post,
      electionType: determinedElectionType,
      house: determinedElectionType === 'house' ? (house as HouseId) : undefined,
      manifesto: manifesto?.trim(),
      imageUrl: imageUrl?.trim()
    };

    candidates.push(newCandidate);
    dataStore.setCandidates(candidates);

    res.status(201).json({ candidate: newCandidate });
  })
);

candidatesRouter.delete(
  '/:candidateId',
  requireAdminSecret,
  asyncHandler((req, res) => {
    const { candidateId } = req.params;

    if (!candidateId) {
      throw new BadRequestError('Candidate ID is required');
    }

    const candidates = dataStore.getCandidates();
    const filtered = candidates.filter((c) => c.id !== candidateId);

    if (filtered.length === candidates.length) {
      throw new BadRequestError('Candidate not found');
    }

    dataStore.setCandidates(filtered);

    res.status(204).send();
  })
);






