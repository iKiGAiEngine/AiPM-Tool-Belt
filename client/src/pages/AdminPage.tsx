import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft,
  Shield,
  ShieldCheck,
  UserCheck,
  UserX,
  Loader2,
  ScrollText,
} from "lucide-react";
import { Link } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { User } from "@shared/schema";

export default function AdminPage() {
  const { toast } = useToast();

  const { data: usersList = [], isLoading } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async (userId: number) => {
      await apiRequest("PATCH", `/api/admin/users/${userId}/toggle-active`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "User updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const changeRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: number; role: string }) => {
      await apiRequest("PATCH", `/api/admin/users/${userId}/role`, { role });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Role updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background">
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="mb-8">
          <div className="flex items-center justify-between gap-4 flex-wrap mb-2">
            <div className="flex items-center gap-3">
              <Link href="/">
                <Button variant="ghost" size="icon" data-testid="button-back-home">
                  <ArrowLeft className="w-4 h-4" />
                </Button>
              </Link>
              <Shield className="w-5 h-5 text-primary" />
              <h1 className="text-2xl font-semibold text-foreground">Admin Dashboard</h1>
            </div>
            <Link href="/admin/audit">
              <Button variant="outline" size="sm" data-testid="link-audit-log">
                <ScrollText className="w-3.5 h-3.5 mr-1.5" />
                Audit Log
              </Button>
            </Link>
          </div>
          <p className="text-muted-foreground ml-12">Manage users and access control.</p>
        </div>

        <Card>
          <div className="p-4 border-b">
            <h2 className="font-medium">Users</h2>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Last Login</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8">
                      <Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : usersList.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No users yet
                    </TableCell>
                  </TableRow>
                ) : (
                  usersList.map((u) => (
                    <TableRow key={u.id} data-testid={`row-user-${u.id}`}>
                      <TableCell className="font-medium text-sm" data-testid={`text-email-${u.id}`}>
                        {u.email}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={u.role === "admin" ? "default" : "secondary"}
                          className="text-xs"
                          data-testid={`badge-role-${u.id}`}
                        >
                          {u.role === "admin" ? (
                            <><ShieldCheck className="w-3 h-3 mr-1" /> Admin</>
                          ) : (
                            "User"
                          )}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`text-xs ${u.isActive ? "text-green-600 border-green-600/30 bg-green-500/10" : "text-red-600 border-red-600/30 bg-red-500/10"}`}
                          data-testid={`badge-status-${u.id}`}
                        >
                          {u.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "-"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : "Never"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => toggleActiveMutation.mutate(u.id)}
                            disabled={toggleActiveMutation.isPending}
                            title={u.isActive ? "Deactivate user" : "Activate user"}
                            data-testid={`button-toggle-active-${u.id}`}
                          >
                            {u.isActive ? (
                              <UserX className="w-4 h-4 text-muted-foreground" />
                            ) : (
                              <UserCheck className="w-4 h-4 text-green-600" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              changeRoleMutation.mutate({
                                userId: u.id,
                                role: u.role === "admin" ? "user" : "admin",
                              })
                            }
                            disabled={changeRoleMutation.isPending}
                            title={u.role === "admin" ? "Demote to user" : "Promote to admin"}
                            data-testid={`button-change-role-${u.id}`}
                          >
                            {u.role === "admin" ? (
                              <Shield className="w-4 h-4 text-muted-foreground" />
                            ) : (
                              <ShieldCheck className="w-4 h-4 text-primary" />
                            )}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>
    </div>
  );
}
