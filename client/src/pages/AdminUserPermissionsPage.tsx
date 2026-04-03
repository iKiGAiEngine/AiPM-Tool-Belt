import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, RotateCcw } from "lucide-react";

interface UserWithPermissions {
  id: number;
  email: string;
  displayName?: string;
  role: string;
  features: string[];
  availableFeatures: string[];
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

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["/api/admin/users/permissions/matrix"],
    queryFn: async () => {
      const res = await fetch("/api/admin/users/permissions/matrix");
      if (!res.ok) throw new Error("Failed to fetch permissions");
      return res.json() as Promise<UserWithPermissions[]>;
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
          Manage which features each user can access. Initial role determines default access.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* User List */}
        <Card className="col-span-1">
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
        <Card className="col-span-2">
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
