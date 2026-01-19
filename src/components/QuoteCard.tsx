import React from "react";
import { Anchor } from "../models/types";

interface QuoteCardProps {
  anchor: Anchor;
  sourceTitle: string;
  onOpenSource: () => void;
}

export default function QuoteCard({
  anchor,
  sourceTitle,
  onOpenSource,
}: QuoteCardProps) {
  return (
    <div className="quote-card">
      <div className="quote-title">Quote from {sourceTitle}</div>
      <div className="quote-text">{anchor.quoteText}</div>
      <button className="button-secondary" type="button" onClick={onOpenSource}>
        Go to source
      </button>
    </div>
  );
}
