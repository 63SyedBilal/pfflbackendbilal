/**
 * Axios implementation for Stats API
 * This file shows the correct way to call the stats API endpoints
 */

import axios, { AxiosInstance, AxiosError } from 'axios';

// API Base URL - Change this to your deployed URL
const API_BASE_URL = 'https://api-staging.phoenixflagfootballleague.com';

/**
 * Create axios instance with default config
 * This handles CORS automatically (browser handles it)
 */
const createApiClient = (): AxiosInstance => {
  const client = axios.create({
    baseURL: API_BASE_URL,
    headers: {
      'Content-Type': 'application/json',
    },
    // Axios automatically handles CORS preflight (OPTIONS) requests
    // The server now returns proper CORS headers, so this will work
  });

  // Request interceptor: Add Authorization token to all requests
  client.interceptors.request.use(
    (config) => {
      // Get token from localStorage, sessionStorage, or wherever you store it
      const token = localStorage.getItem('token') || sessionStorage.getItem('token');
      
      if (token) {
        // API expects: Authorization: "Bearer <token>"
        config.headers.Authorization = `Bearer ${token}`;
      }
      
      return config;
    },
    (error) => {
      return Promise.reject(error);
    }
  );

  // Response interceptor: Handle errors globally
  client.interceptors.response.use(
    (response) => {
      return response;
    },
    (error: AxiosError) => {
      // Handle 401 (Unauthorized) - token expired or invalid
      if (error.response?.status === 401) {
        // Clear token and redirect to login
        localStorage.removeItem('token');
        sessionStorage.removeItem('token');
        // window.location.href = '/login'; // Uncomment if needed
      }
      
      // Return error with message from API
      const errorMessage = 
        (error.response?.data as any)?.error || 
        error.message || 
        'An error occurred';
      
      return Promise.reject(new Error(errorMessage));
    }
  );

  return client;
};

// Create the API client instance
const apiClient = createApiClient();

/**
 * GET /api/stats - Fetch stats for a match
 * 
 * @param matchId - MongoDB ObjectId of the match
 * @returns Promise with stats data
 */
export async function getMatchStats(matchId: string) {
  try {
    // API expects: GET /api/stats?matchId=<id>
    const response = await apiClient.get('/api/stats', {
      params: {
        matchId, // This becomes ?matchId=<id> in the URL
      },
    });
    
    return response.data; // { message: "...", data: [...] }
  } catch (error: any) {
    console.error('Error fetching match stats:', error.message);
    throw error;
  }
}

/**
 * POST /api/stats - Update player stats (Stat Keeper only)
 * 
 * @param matchId - MongoDB ObjectId of the match
 * @param teamId - MongoDB ObjectId of the team
 * @param playerId - MongoDB ObjectId of the player
 * @param stats - Stats object with player statistics
 * @param leagueId - Optional MongoDB ObjectId of the league
 * @returns Promise with updated match data
 */
export async function updatePlayerStats(
  matchId: string,
  teamId: string,
  playerId: string,
  stats: {
    catches?: number;
    catchYards?: number;
    rushes?: number;
    rushYards?: number;
    passAttempts?: number;
    passYards?: number;
    completions?: number;
    touchdowns?: number;
    flagPull?: number;
    sack?: number;
    interceptions?: number;
    safeties?: number;
    conversionPoints?: number;
    extraPoints?: number; // Also accepted
  },
  leagueId?: string
) {
  try {
    // API expects: POST /api/stats with body { matchId, teamId, playerId, stats, leagueId? }
    const response = await apiClient.post('/api/stats', {
      matchId,
      teamId,
      playerId,
      stats,
      ...(leagueId && { leagueId }), // Only include if provided
    });
    
    return response.data;
  } catch (error: any) {
    console.error('Error updating player stats:', error.message);
    throw error;
  }
}

/**
 * POST /api/stats/submit - Submit stats for approval
 * 
 * @param matchId - MongoDB ObjectId of the match
 * @returns Promise with submission confirmation
 */
export async function submitStatsForApproval(matchId: string) {
  try {
    const response = await apiClient.post('/api/stats/submit', {
      matchId,
    });
    
    return response.data;
  } catch (error: any) {
    console.error('Error submitting stats:', error.message);
    throw error;
  }
}

/**
 * POST /api/stats/approve - Approve stats (Admin/Superadmin only)
 * 
 * @param matchId - MongoDB ObjectId of the match
 * @returns Promise with approval confirmation
 */
export async function approveStats(matchId: string) {
  try {
    const response = await apiClient.post('/api/stats/approve', {
      matchId,
    });
    
    return response.data;
  } catch (error: any) {
    console.error('Error approving stats:', error.message);
    throw error;
  }
}

/**
 * POST /api/stats/reject - Reject stats (Admin/Superadmin only)
 * 
 * @param matchId - MongoDB ObjectId of the match
 * @param reason - Optional reason for rejection
 * @returns Promise with rejection confirmation
 */
export async function rejectStats(matchId: string, reason?: string) {
  try {
    const response = await apiClient.post('/api/stats/reject', {
      matchId,
      ...(reason && { reason }),
    });
    
    return response.data;
  } catch (error: any) {
    console.error('Error rejecting stats:', error.message);
    throw error;
  }
}

// ============================================
// USAGE EXAMPLES
// ============================================

/**
 * Example: Get stats for a match
 */
async function exampleGetStats() {
  try {
    const matchId = '507f1f77bcf86cd799439011';
    const result = await getMatchStats(matchId);
    console.log('Match stats:', result);
    // Result: { message: "Stats retrieved successfully", data: [...] }
  } catch (error: any) {
    console.error('Failed to get stats:', error.message);
  }
}

/**
 * Example: Update player stats (Stat Keeper)
 */
async function exampleUpdateStats() {
  try {
    const result = await updatePlayerStats(
      'match-id-here',
      'team-id-here',
      'player-id-here',
      {
        catches: 5,
        catchYards: 45,
        touchdowns: 2,
        flagPull: 3,
      },
      'league-id-here' // optional
    );
    console.log('Stats updated:', result);
  } catch (error: any) {
    if (error.message.includes('Only Stat Keeper')) {
      console.error('Permission denied: You must be a stat-keeper');
    } else {
      console.error('Failed to update stats:', error.message);
    }
  }
}

/**
 * Example: Submit stats for approval
 */
async function exampleSubmitStats() {
  try {
    const result = await submitStatsForApproval('match-id-here');
    console.log('Stats submitted:', result);
  } catch (error: any) {
    console.error('Failed to submit stats:', error.message);
  }
}
