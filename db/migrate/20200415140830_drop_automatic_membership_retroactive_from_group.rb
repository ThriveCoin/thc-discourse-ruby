# frozen_string_literal: true

class DropAutomaticMembershipRetroactiveFromGroup < ActiveRecord::Migration[6.0]
  DROPPED_COLUMNS ||= {
    groups: %i{
      automatic_membership_retroactive
    }
  }

  def up
    DROPPED_COLUMNS.each do |table, columns|
      Migration::ColumnDropper.execute_drop(table, columns)
    end
  end

  def down
    raise ActiveRecord::IrreversibleMigration
  end
end
