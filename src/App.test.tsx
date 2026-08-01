import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("App shell", () => {
  it("renders the data room shell", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: /data room/i })).toBeInTheDocument();
    expect(screen.getByText(/application shell is ready/i)).toBeInTheDocument();
  });
});
