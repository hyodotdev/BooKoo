import {useConvexAuth} from '@convex-dev/auth/react';
import {useQuery} from 'convex-helpers/react/cache';
import type {FunctionReturnType} from 'convex/server';

import {api} from '@convex/_generated/api';

type CurrentUser = FunctionReturnType<typeof api.user.queries.currentUser>;

export function useCurrentUser(): CurrentUser | undefined {
  const {isAuthenticated} = useConvexAuth();
  return useQuery(api.user.queries.currentUser, isAuthenticated ? {} : 'skip');
}
