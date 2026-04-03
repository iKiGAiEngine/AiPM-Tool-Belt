import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, RotateCcw, Zap } from "lucide-react";

interface UserWithPermissions {
  id: number;
  email: string;
  displayName?: string;
  role: string;
  features: string[];
  availableFeatures: string[];
}

interface PermissionProfile {
  id: number;
  name: string;
  description?: string;
  features: string[];
}

const FEATURE_LABELS: Record<string, string> = {
  "proposal-log": "Proposal Log",
  "vendor-database": "Vendor Database",
  "submittal-builder": "Submittal Builder",
  "schedule-converter": "Schedule Converter",
  "spec-extractor": "Spec Extractor",
  "quote-parser": "Quote Parser",
  "plan-parser": "Plan Parser",
  "bc-sync": "BC Sync",
  "draft-review": "Draft Review",
  "central-settings": "Central Settings",
  "project-start": "Project Start",
};

export function AdminUserPermissionsPage() {
  const { toast } = useToast();
  const [selectedUser, setSelectedUser] = useState<number | null>(null);
  const [userFeatures, setUserFeatures] = useState<Record<number, Set<string>>>({});
  const [expandedProfile, setExpandedProfile] = useState<number | null>(null);

  const { data: rawUsers = [], isLoading } = useQuery({
    queryKey: ["/api/admin/users/permissions/matrix"],
    queryFn: async () => {
      const res = await fetch("/api/admin/users/permissions/matrix");
      if (!res.ok) throw new Error("Failed to fetch permissions");
      return res.json() as Promise<UserWithPermissions[]>;
    },
  });

  // Deduplicate users by id
  const users = Array.from(
    new Map(rawUsers.map((user) => [user.id, user])).values()
  );

  const { data: profiles = [], isLoading: profilesLoading } = useQuery({
    queryKey: ["/api/admin/profiles"],
    queryFn: async () => {
      const res = await fetch("/api/admin/profiles");
      if (!res.ok) return [];
      return res.json() as Promise<PermissionProfile[]>;
    },
  });

  const assignProfileMutation = useMutation({
    mutationFn: async ({ userId, profileId }: { userId: number; profileId: number }) => {
      const res = await apiRequest("POST", `/api/admin/users/${userId}/assign-profile/${profileId}`, {});
      return res;
    },
    onSuccess: (_, { userId, profileId }) => {
      const profile = profiles.find((p) => p.id === profileId);
      if (profile) {
        setUserFeatures((prev) => ({
          ...prev,
          [userId]: new Set(profile.features),
        }));
      }
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users/permissions/matrix"] });
      toast({ title: `Applied profile "${profile?.name}" to user` });
    },
    onError: () => {
      toast({ title: "Failed to assign profile", variant: "destructive" });
    },
  });

  // Initialize userFeatures state
  useEffect(() => {
    if (users.length > 0) {
      const initialFeatures: Record<number, Set<string>> = {};
      users.forEach((user) => {
        initialFeatures[user.id] = new Set(user.features);
      });
      setUserFeatures(initialFeatures);
      if (!selectedUser) {
        setSelectedUser(users[0].id);
      }
    }
  }, [users, selectedUser]);

  const updatePermissionsMutation = useMutation({
    mutationFn: async ({ userId, features }: { userId: number; features: string[] }) => {
      const res = await apiRequest("PATCH", `/api/admin/users/${userId}/permissions`, {
        features,
      });
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users/permissions/matrix"] });
      toast({ title: "Permissions updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update permissions", variant: "destructive" });
    },
  });

  const resetPermissionsMutation = useMutation({
    mutationFn: async (userId: number) => {
      const res = await apiRequest("POST", `/api/admin/users/${userId}/reset-permissions`, {});
      return res;
    },
    onSuccess: (_, userId) => {
      const user = users.find((u) => u.id === userId);
      if (user) {
        setUserFeatures((prev) => ({
          ...prev,
          [userId]: new Set(user.features),
        }));
      }
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users/permissions/matrix"] });
      toast({ title: "Permissions reset to role defaults" });
    },
    onError: () => {
      toast({ title: "Failed to reset permissions", variant: "destructive" });
    },
  });

  const selectedUserData = users.find((u) => u.id === selectedUser);
  const currentFeatures = selectedUser ? userFeatures[selectedUser] || new Set<string>() : new Set<string>();
  const availableFeatures = selectedUserData?.availableFeatures || [];

  const handleFeatureToggle = (feature: string) => {
    if (!selectedUser) return;
    setUserFeatures((prev) => {
      const updated = new Set(prev[selectedUser] || []);
      if (updated.has(feature)) {
        updated.delete(feature);
      } else {
        updated.add(feature);
      }
      return { ...prev, [selectedUser]: updated };
    });
  };

  const handleSavePermissions = () => {
    if (!selectedUser) return;
    const features = Array.from(currentFeatures);
    updatePermissionsMutation.mutate({ userId: selectedUser, features });
  };

  const handleResetPermissions = () => {
    if (!selectedUser) return;
    resetPermissionsMutation.mutate(selectedUser);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-gold" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">User Feature Access</h1>
        <p className="text-muted-foreground mt-2">
          Manage which features each user can access. Use profiles for quick assignment or customize individually.
        </p>
      </div>

      <div className="grid grid-cols-4 gap-6">
        {/* Profiles */}
        <Card className="col-span-1">
          <CardHeader>
            <CardTitle className="text-lg">Profiles</CardTitle>
          </CardHeader>
          <CardContent>
            {profilesLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <div className="space-y-2">
                {profiles.map((profile) => (
                  <div key={profile.id} className="border rounded-md p-3 bg-muted/50">
                    <button
                      onClick={() =>
                        setExpandedProfile(expandedProfile === profile.id ? null : profile.id)
                      }
                      className="w-full text-left font-medium text-sm hover:text-gold transition"
                      data-testid={`button-profile-${profile.id}`}
                    >
                      {profile.name}
                    </button>
                    {expandedProfile === profile.id && (
                      <div className="mt-2 space-y-2 pt-2 border-t">
                        <p className="text-xs text-muted-foreground">{profile.description}</p>
                        <div className="text-xs space-y-1">
                          {profile.features.map((f) => (
                            <div key={f} className="text-muted-foreground">
                              • {FEATURE_LABELS[f] || f}
                            </div>
                          ))}
                        </div>
                        {selectedUser && (
                          <Button
                            size="sm"
                            onClick={() =>
                              assignProfileMutation.mutate({ userId: selectedUser, profileId: profile.id })
                            }
                            disabled={assignProfileMutation.isPending}
                            className="w-full mt-2"
                            data-testid={`button-assign-profile-${profile.id}`}
                          >
                            <Zap className="w-3 h-3 mr-1" />
                            Apply to {selectedUser ? "User" : "Select User"}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* User List */}
        <Card className="col-span-1" data-testid="card-user-list">
          <CardHeader>
            <CardTitle>Users</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {users.map((user) => (
                <button
                  key={user.id}
                  onClick={() => setSelectedUser(user.id)}
                  className={`w-full text-left px-3 py-2 rounded-md transition ${
                    selectedUser === user.id
                      ? "bg-gold/20 border border-gold/50"
                      : "hover:bg-muted"
                  }`}
                  data-testid={`user-button-${user.id}`}
                >
                  <div className="font-medium text-sm">{user.displayName || user.email}</div>
                  <div className="text-xs text-muted-foreground">{user.role}</div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Permission Matrix */}
        <Card className="col-span-2" data-testid="card-permission-matrix">
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle>{selectedUserData?.displayName || selectedUserData?.email}</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">Role: {selectedUserData?.role}</p>
              </div>
              {selectedUser && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResetPermissions}
                  disabled={resetPermissionsMutation.isPending}
                  data-testid="button-reset-permissions"
                >
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Reset to Defaults
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {selectedUser && (
              <>
                <div className="space-y-3 mb-6">
                  {availableFeatures.map((feature) => (
                    <div key={feature} className="flex items-center space-x-3">
                      <Checkbox
                        id={`feature-${feature}`}
                        checked={currentFeatures.has(feature)}
                        onCheckedChange={() => handleFeatureToggle(feature)}
                        data-testid={`checkbox-feature-${feature}`}
                      />
                      <label
                        htmlFor={`feature-${feature}`}
                        className="text-sm cursor-pointer select-none"
                      >
                        {FEATURE_LABELS[feature] || feature}
                      </label>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={handleSavePermissions}
                    disabled={updatePermissionsMutation.isPending}
                    data-testid="button-save-permissions"
                  >
                    {updatePermissionsMutation.isPending && (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    )}
                    Save Changes
                  </Button>
                  {JSON.stringify(Array.from(currentFeatures)) !==
                    JSON.stringify(selectedUserData?.features || []) && (
                    <p className="text-sm text-amber-600 flex items-center">
                      Changes not saved
                    </p>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
