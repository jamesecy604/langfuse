import { useState } from "react";
import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/src/components/ui/dialog";
import { TopupBalanceForm } from "./TopupBalanceForm";

export function TopupBalanceDialog() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <DialogTrigger asChild>
            <Button variant="outline">Top Up</Button>
          </DialogTrigger>
        </div>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Top Up Balance</DialogTitle>
          </DialogHeader>
          <TopupBalanceForm isOpen={isOpen} onOpenChange={setIsOpen} />
        </DialogContent>
      </div>
    </Dialog>
  );
}
