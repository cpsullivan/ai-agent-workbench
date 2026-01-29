/**
 * Session Invite API
 *
 * Invite users to collaborate on a session
 * POST /session-invite
 *
 * Body:
 * {
 *   session_id: string;
 *   user_email: string; // Email of user to invite
 *   role: 'owner' | 'editor' | 'viewer';
 * }
 *
 * @module session-invite
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireAuth } from '../_shared/auth.ts';
import type { AppUser } from '../_shared/auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface InviteRequest {
  session_id: string;
  user_email: string;
  role: 'owner' | 'editor' | 'viewer';
}

function createSuccessResponse(data: unknown) {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status: 200,
  });
}

function createErrorResponse(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  });
}

async function handleInvite(req: Request, user: AppUser): Promise<Response> {
  try {
    const body: InviteRequest = await req.json();

    // Validate required fields
    if (!body.session_id || !body.user_email || !body.role) {
      return createErrorResponse('Missing required fields: session_id, user_email, role');
    }

    // Validate role
    if (!['owner', 'editor', 'viewer'].includes(body.role)) {
      return createErrorResponse('Invalid role. Must be owner, editor, or viewer');
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check session exists
    const { data: session, error: sessionError } = await supabase
      .from('free_agent_sessions')
      .select('id, user_id, name, visibility')
      .eq('id', body.session_id)
      .single();

    if (sessionError || !session) {
      return createErrorResponse('Session not found', 404);
    }

    // Check if current user has permission to invite (must be owner or have owner role)
    const isOwner = session.user_id === user.id;

    if (!isOwner) {
      const { data: collaborator } = await supabase
        .from('session_collaborators')
        .select('role')
        .eq('session_id', body.session_id)
        .eq('user_id', user.id)
        .single();

      if (!collaborator || collaborator.role !== 'owner') {
        return createErrorResponse('Unauthorized: Only session owners can invite collaborators', 403);
      }
    }

    // Find user to invite by email
    const { data: inviteeData, error: inviteeError } = await supabase
      .from('users')
      .select('id, email, full_name')
      .eq('email', body.user_email)
      .single();

    if (inviteeError || !inviteeData) {
      return createErrorResponse('User not found with that email address', 404);
    }

    // Check if user is trying to invite themselves
    if (inviteeData.id === user.id) {
      return createErrorResponse('Cannot invite yourself', 400);
    }

    // Check if user is already a collaborator
    const { data: existingCollaborator } = await supabase
      .from('session_collaborators')
      .select('id, role')
      .eq('session_id', body.session_id)
      .eq('user_id', inviteeData.id)
      .single();

    if (existingCollaborator) {
      // Update existing collaborator role
      const { error: updateError } = await supabase
        .from('session_collaborators')
        .update({
          role: body.role,
          invited_by: user.id,
          invited_at: new Date().toISOString(),
        })
        .eq('id', existingCollaborator.id);

      if (updateError) {
        console.error('Error updating collaborator:', updateError);
        return createErrorResponse('Failed to update collaborator role');
      }

      return createSuccessResponse({
        message: 'Collaborator role updated',
        collaborator: {
          id: existingCollaborator.id,
          user_id: inviteeData.id,
          user_email: inviteeData.email,
          user_name: inviteeData.full_name,
          role: body.role,
        },
      });
    }

    // Add new collaborator using helper function
    const { data: collaboratorId, error: addError } = await supabase.rpc('add_collaborator', {
      p_resource_type: 'session',
      p_resource_id: body.session_id,
      p_user_id: inviteeData.id,
      p_role: body.role,
      p_invited_by: user.id,
    });

    if (addError) {
      console.error('Error adding collaborator:', addError);
      return createErrorResponse('Failed to add collaborator: ' + addError.message);
    }

    // TODO: Send email notification (optional, requires email service setup)
    // await sendInviteEmail(inviteeData.email, session.name, user.full_name);

    return createSuccessResponse({
      message: 'User invited successfully',
      collaborator: {
        id: collaboratorId,
        user_id: inviteeData.id,
        user_email: inviteeData.email,
        user_name: inviteeData.full_name,
        role: body.role,
      },
    });
  } catch (error) {
    console.error('Error in handleInvite:', error);
    return createErrorResponse(
      error instanceof Error ? error.message : 'An unknown error occurred',
      500
    );
  }
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return createErrorResponse('Method not allowed', 405);
  }

  // Require authentication
  return requireAuth(req, handleInvite);
});
