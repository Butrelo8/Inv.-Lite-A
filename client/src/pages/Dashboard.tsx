import { useState } from "react";
import { useInventory, useCreateInventoryItem, useUpdateInventoryItem, useDeleteInventoryItem, type InventoryItem } from "@/hooks/use-inventory";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogDescription
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { InventoryForm } from "@/components/InventoryForm";
import { StatusBadge } from "@/components/StatusBadge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, Edit2, Trash2, Package, FilterX, Loader2 } from "lucide-react";
import { format } from "date-fns";

export default function Dashboard() {
  const [search, setSearch] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const { data: items, isLoading, error } = useInventory(search);
  const createMutation = useCreateInventoryItem();
  const updateMutation = useUpdateInventoryItem();
  const deleteMutation = useDeleteInventoryItem();
  const { toast } = useToast();

  const handleCreate = async (data: any) => {
    try {
      await createMutation.mutateAsync(data);
      setIsCreateOpen(false);
      toast({
        title: "Success",
        description: "Inventory item created successfully.",
      });
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  const handleUpdate = async (data: any) => {
    if (!editingItem) return;
    try {
      await updateMutation.mutateAsync({ id: editingItem.id, ...data });
      setEditingItem(null);
      toast({
        title: "Success",
        description: "Item updated successfully.",
      });
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    try {
      await deleteMutation.mutateAsync(deletingId);
      setDeletingId(null);
      toast({
        title: "Success",
        description: "Item deleted successfully.",
      });
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-background p-6 md:p-8 space-y-8">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold text-foreground tracking-tight">
            Inventory
          </h1>
          <p className="text-muted-foreground mt-1 text-lg">
            Manage your assets and equipment efficiently.
          </p>
        </div>
        <Button 
          onClick={() => setIsCreateOpen(true)}
          className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg hover:shadow-primary/25 transition-all"
        >
          <Plus className="w-5 h-5 mr-2" />
          Add Item
        </Button>
      </div>

      {/* Filters & Controls */}
      <div className="flex items-center gap-4 bg-card p-4 rounded-xl border border-border/50 shadow-sm">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Search by name or code..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-background border-border/50 focus:border-primary/50"
          />
        </div>
      </div>

      {/* Data Grid */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/30">
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[100px]">Code</TableHead>
              <TableHead className="min-w-[200px]">Name / Description</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Condition</TableHead>
              <TableHead>Units</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="h-48 text-center">
                  <div className="flex items-center justify-center text-muted-foreground gap-2">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Loading inventory...
                  </div>
                </TableCell>
              </TableRow>
            ) : items && items.length > 0 ? (
              items.map((item) => (
                <TableRow key={item.id} className="hover:bg-muted/20 transition-colors group">
                  <TableCell className="font-mono text-sm font-medium text-muted-foreground">
                    {item.code}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium text-foreground">{item.name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {item.serialNumber ? `S/N: ${item.serialNumber}` : "No S/N"}
                    </div>
                  </TableCell>
                  <TableCell>{item.category || "Uncategorized"}</TableCell>
                  <TableCell>
                    <StatusBadge status={item.condition || "Unknown"} />
                  </TableCell>
                  <TableCell>{item.units}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {item.purchaseDate ? format(new Date(item.purchaseDate), "MMM dd, yyyy") : "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 hover:text-primary hover:bg-primary/10"
                        onClick={() => setEditingItem(item)}
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setDeletingId(item.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={7} className="h-64 text-center">
                  <div className="flex flex-col items-center justify-center text-muted-foreground gap-3">
                    <div className="p-4 rounded-full bg-muted/50">
                      {search ? <FilterX className="w-8 h-8" /> : <Package className="w-8 h-8" />}
                    </div>
                    <div>
                      <p className="font-medium text-lg">No items found</p>
                      <p className="text-sm mt-1 max-w-xs mx-auto">
                        {search 
                          ? "Try adjusting your search terms or filters."
                          : "Your inventory is empty. Add your first item to get started."}
                      </p>
                    </div>
                    {!search && (
                      <Button 
                        variant="outline" 
                        onClick={() => setIsCreateOpen(true)}
                        className="mt-2"
                      >
                        Add your first item
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Create Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Inventory Item</DialogTitle>
            <DialogDescription>
              Enter the details of the new item below.
            </DialogDescription>
          </DialogHeader>
          <InventoryForm 
            onSubmit={handleCreate} 
            isSubmitting={createMutation.isPending} 
            onCancel={() => setIsCreateOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editingItem} onOpenChange={(open) => !open && setEditingItem(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Item</DialogTitle>
            <DialogDescription>
              Update the item details below.
            </DialogDescription>
          </DialogHeader>
          {editingItem && (
            <InventoryForm 
              defaultValues={editingItem}
              onSubmit={handleUpdate} 
              isSubmitting={updateMutation.isPending} 
              onCancel={() => setEditingItem(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingId} onOpenChange={(open) => !open && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the item from your inventory.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete Item"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
