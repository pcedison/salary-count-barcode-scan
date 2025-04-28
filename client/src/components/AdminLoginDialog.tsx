import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAdmin } from "@/hooks/useAdmin";
import { Loader2 } from "lucide-react";

interface AdminLoginDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  title?: string;
  description?: string;
}

export default function AdminLoginDialog({
  isOpen,
  onClose,
  onSuccess,
  title = "管理員驗證",
  description = "請輸入六位數管理員密碼以繼續操作",
}: AdminLoginDialogProps) {
  const [pin, setPin] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const { verifyPin } = useAdmin();

  const handleVerify = async () => {
    if (pin.length !== 6) {
      return;
    }

    setIsVerifying(true);
    const success = await verifyPin(pin);
    setIsVerifying(false);

    if (success) {
      onSuccess?.();
      onClose();
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleVerify();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-4">
          <div className="flex flex-col space-y-2">
            <label htmlFor="adminPin" className="font-medium">
              管理員密碼
            </label>
            <Input
              id="adminPin"
              type="password"
              maxLength={6}
              pattern="[0-9]*"
              inputMode="numeric"
              placeholder="請輸入六位數密碼"
              value={pin}
              onChange={(e) => {
                // Only allow numbers
                const value = e.target.value.replace(/[^0-9]/g, "");
                if (value.length <= 6) {
                  setPin(value);
                }
              }}
              onKeyPress={handleKeyPress}
              className="w-full"
              autoFocus
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isVerifying}>
            取消
          </Button>
          <Button 
            onClick={handleVerify} 
            disabled={pin.length !== 6 || isVerifying}
          >
            {isVerifying ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                驗證中
              </>
            ) : (
              "確認"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}