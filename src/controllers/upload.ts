import { Request, Response } from "express";

export function uploadController(req: Request, res: Response) {
  res.send("Upload controller");    
}
