import express from "express";
import { requireAccount } from "../middlewares/auth.middleware.js";
import {
  getProposals, getProposalPreview, acceptProposalRequest,
  rejectProposalRequest, withdrawProposalRequest
} from "../controllers/proposals.controller.js";
import {
  createCloudBoard, getCloudBoard, renameCloudBoard, updateBoardSettings,
  createShareLink, listShareLinks, revokeShareLink,
  getCommitHistory, createCommit, restoreCommit, getBoardMembers, reviewBoardJoinRequest
} from "../controllers/boards.controller.js";

const router = express.Router();
router.use(requireAccount);
router.post("/", createCloudBoard);
router.get("/:boardId", getCloudBoard);
router.get("/:boardId/members", getBoardMembers);
router.post("/:boardId/join-requests/:requestId/:action", reviewBoardJoinRequest);
router.patch("/:boardId", renameCloudBoard);
router.patch("/:boardId/settings", updateBoardSettings);
router.get("/:boardId/proposals", getProposals);
router.get("/:boardId/proposals/:proposalId/preview", getProposalPreview);
router.post("/:boardId/proposals/:proposalId/accept", acceptProposalRequest);
router.post("/:boardId/proposals/:proposalId/reject", rejectProposalRequest);
router.post("/:boardId/proposals/:proposalId/withdraw", withdrawProposalRequest);
router.post("/:boardId/shares", createShareLink);
router.get("/:boardId/shares", listShareLinks);
router.delete("/:boardId/shares/:shareId", revokeShareLink);
router.get("/:boardId/commits", getCommitHistory);
router.post("/:boardId/commits", createCommit);
router.post("/:boardId/commits/:commitId/restore", restoreCommit);
export default router;
