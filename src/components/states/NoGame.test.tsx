import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { NoGame } from "./NoGame";

describe("NoGame", () => {
  it("renders the idle empty state with a coaching prompt", () => {
    render(<NoGame />);
    expect(screen.getByText("No game running")).toBeInTheDocument();
    expect(screen.getByText(/start coaching/i)).toBeInTheDocument();
  });
});
