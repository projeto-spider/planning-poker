defmodule Poker.Projects.Story do
  @moduledoc false
  use Poker.Web, :model

  alias Poker.Projects.Story

  schema "stories" do
    field :title, :string
    field :description, :string
    field :estimation, :integer
    belongs_to :project, Poker.Projects.Project

    timestamps()
  end

  def changeset(%Story{} = story, attrs \\ %{}) do
    story
    |> cast(attrs, [:title, :description, :estimation, :project_id])
  end

  def validate(story) do
    story
    |> validate_required([:title, :project_id])
    |> assoc_constraint(:project)
  end
end